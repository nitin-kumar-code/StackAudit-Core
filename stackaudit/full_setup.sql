CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE workloads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE attribution_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workload_id UUID NOT NULL REFERENCES workloads(id) ON DELETE CASCADE,
    rule_type TEXT NOT NULL,
    rule_value TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (workload_id, rule_type, rule_value)
);

CREATE TABLE pricing_catalog (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    input_price NUMERIC NOT NULL,
    output_price NUMERIC NOT NULL,
    cache_read_price NUMERIC,
    cache_creation_price NUMERIC,
    effective_from TIMESTAMPTZ NOT NULL,
    effective_until TIMESTAMPTZ,
    source TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (provider, model, effective_from)
);

CREATE TABLE usage_events (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    input_tokens BIGINT NOT NULL,
    output_tokens BIGINT NOT NULL,
    cache_read_tokens BIGINT NOT NULL DEFAULT 0,
    cache_creation_tokens BIGINT NOT NULL DEFAULT 0,
    provider_reference TEXT NOT NULL,
    workload_id UUID REFERENCES workloads(id) ON DELETE SET NULL,
    calculated_cost NUMERIC NOT NULL,
    raw_response_hash TEXT NOT NULL,
    captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, provider, provider_reference)
);

CREATE TABLE outcome_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workload_id UUID NOT NULL REFERENCES workloads(id) ON DELETE CASCADE,
    outcome_type TEXT NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    count BIGINT NOT NULL DEFAULT 1,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE audit_findings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workload_id UUID REFERENCES workloads(id) ON DELETE SET NULL,
    category TEXT NOT NULL,
    finding TEXT NOT NULL,
    confidence TEXT NOT NULL,
    evidence JSONB,
    timestamp TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Drop the existing unique constraint to alter columns safely
ALTER TABLE attribution_rules DROP CONSTRAINT IF EXISTS attribution_rules_workload_id_rule_type_rule_value_key;

-- Add organization_id, provider to attribution_rules
-- We assume it's early in V0 and truncate the table if needed, or just set org from workload
ALTER TABLE attribution_rules ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

-- Backfill organization_id from workloads (in case there's data)
UPDATE attribution_rules r 
SET organization_id = w.organization_id 
FROM workloads w 
WHERE r.workload_id = w.id AND r.organization_id IS NULL;

ALTER TABLE attribution_rules ALTER COLUMN organization_id SET NOT NULL;

-- Rename and type columns for Provider + Match isolation
ALTER TABLE attribution_rules RENAME COLUMN rule_type TO match_type;
ALTER TABLE attribution_rules RENAME COLUMN rule_value TO match_value;
ALTER TABLE attribution_rules ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'openai';
ALTER TABLE attribution_rules ALTER COLUMN provider DROP DEFAULT;

-- Add strict ambiguity prevention constraint
ALTER TABLE attribution_rules ADD CONSTRAINT unique_org_provider_match UNIQUE (organization_id, provider, match_type, match_value);

-- Add api_key_id to usage_events for retroactive query-time mapping
ALTER TABLE usage_events ADD COLUMN IF NOT EXISTS api_key_id TEXT;
ALTER TABLE usage_events DROP COLUMN IF EXISTS workload_id;

-- Create query-time attribution view with security_invoker = true
CREATE OR REPLACE VIEW v_attributed_usage_events WITH (security_invoker = true) AS
SELECT 
    u.*,
    r.workload_id
FROM usage_events u
LEFT JOIN attribution_rules r 
    ON u.organization_id = r.organization_id 
    AND u.provider = r.provider 
    AND r.match_type = 'api_key' 
    AND u.api_key_id = r.match_value;

-- Add performance indexes
CREATE INDEX IF NOT EXISTS idx_usage_events_attribution ON usage_events(organization_id, provider, api_key_id);
CREATE INDEX IF NOT EXISTS idx_attribution_rules_match ON attribution_rules(organization_id, provider, match_type, match_value);

-- Add idempotency_key to outcome_events for safe retries
ALTER TABLE outcome_events ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

-- Enforce uniqueness of idempotency_key per workload
ALTER TABLE outcome_events ADD CONSTRAINT unique_workload_idempotency UNIQUE (workload_id, idempotency_key);

-- Add indexes for outcome querying and aggregation
-- Outcome analytics frequently filter by workload_id, outcome_type, and timestamp
CREATE INDEX IF NOT EXISTS idx_outcome_events_workload_type_time ON outcome_events (workload_id, outcome_type, timestamp);

-- Ensure v_attributed_usage_events has an index on timestamp for fast time-window joins
-- Note: usage_events already has PK and organization_id indexes. We add one for workload/time filtering via the view.
-- Since the view derives workload_id dynamically, queries will filter by the joined workload_id and usage timestamp.
-- We can't index a view directly in Postgres unless materialized, but we can index usage_events(timestamp)
CREATE INDEX IF NOT EXISTS idx_usage_events_timestamp ON usage_events (timestamp);

-- RPC for aggregating overall cost and outcomes efficiently
CREATE OR REPLACE FUNCTION aggregate_cost_and_outcomes(
    p_organization_id UUID,
    p_workload_id UUID,
    p_outcome_type TEXT,
    p_start_time TIMESTAMPTZ,
    p_end_time TIMESTAMPTZ
)
RETURNS TABLE (
    total_cost NUMERIC,
    total_outcomes BIGINT
) AS $$
BEGIN
    RETURN QUERY
    WITH cost_agg AS (
        SELECT COALESCE(SUM(calculated_cost), 0) AS total_cost
        FROM v_attributed_usage_events
        WHERE workload_id = p_workload_id
          AND timestamp >= p_start_time
          AND timestamp < p_end_time
          -- org check is implicit via workload, but added for safety
          AND organization_id = p_organization_id
    ),
    outcome_agg AS (
        SELECT COALESCE(SUM(count), 0) AS total_outcomes
        FROM outcome_events o
        JOIN workloads w ON w.id = o.workload_id
        WHERE o.workload_id = p_workload_id
          AND o.outcome_type = p_outcome_type
          AND o.timestamp >= p_start_time
          AND o.timestamp < p_end_time
          AND w.organization_id = p_organization_id
    )
    SELECT c.total_cost, o.total_outcomes
    FROM cost_agg c, outcome_agg o;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;

-- RPC for historical daily aggregation
CREATE OR REPLACE FUNCTION aggregate_daily_cost_and_outcomes(
    p_organization_id UUID,
    p_workload_id UUID,
    p_outcome_type TEXT,
    p_start_time TIMESTAMPTZ,
    p_end_time TIMESTAMPTZ
)
RETURNS TABLE (
    period_start TIMESTAMPTZ,
    total_cost NUMERIC,
    total_outcomes BIGINT
) AS $$
BEGIN
    RETURN QUERY
    WITH days AS (
        SELECT generate_series(
            date_trunc('day', p_start_time),
            date_trunc('day', p_end_time - interval '1 microsecond'),
            '1 day'::interval
        ) AS day
    ),
    daily_cost AS (
        SELECT 
            date_trunc('day', timestamp) AS day,
            SUM(calculated_cost) AS cost
        FROM v_attributed_usage_events
        WHERE workload_id = p_workload_id
          AND timestamp >= p_start_time
          AND timestamp < p_end_time
          AND organization_id = p_organization_id
        GROUP BY 1
    ),
    daily_outcomes AS (
        SELECT 
            date_trunc('day', o.timestamp) AS day,
            SUM(o.count) AS count
        FROM outcome_events o
        JOIN workloads w ON w.id = o.workload_id
        WHERE o.workload_id = p_workload_id
          AND o.outcome_type = p_outcome_type
          AND o.timestamp >= p_start_time
          AND o.timestamp < p_end_time
          AND w.organization_id = p_organization_id
        GROUP BY 1
    )
    SELECT 
        d.day AS period_start,
        COALESCE(c.cost, 0) AS total_cost,
        COALESCE(o.count, 0) AS total_outcomes
    FROM days d
    LEFT JOIN daily_cost c ON d.day = c.day
    LEFT JOIN daily_outcomes o ON d.day = o.day
    ORDER BY d.day ASC;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;
-- 1. Unpriced Usage Tracking
ALTER TABLE usage_events ADD COLUMN IF NOT EXISTS is_unpriced BOOLEAN NOT NULL DEFAULT false;

-- 2. Denormalize organization_id onto outcome_events
ALTER TABLE outcome_events ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

UPDATE outcome_events o 
SET organization_id = w.organization_id 
FROM workloads w 
WHERE o.workload_id = w.id AND o.organization_id IS NULL;

-- 3. Prevent Workload Deletion from Destroying Outcome History
-- Make workload_id nullable first
ALTER TABLE outcome_events ALTER COLUMN workload_id DROP NOT NULL;
ALTER TABLE outcome_events DROP CONSTRAINT IF EXISTS outcome_events_workload_id_fkey;
ALTER TABLE outcome_events ADD CONSTRAINT outcome_events_workload_id_fkey FOREIGN KEY (workload_id) REFERENCES workloads(id) ON DELETE SET NULL;

-- 4. Idempotency Constraint Scope
-- Drop old constraint safely
ALTER TABLE outcome_events DROP CONSTRAINT IF EXISTS unique_workload_idempotency;
-- Create new constraint on org + key
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'unique_org_idempotency') THEN
        ALTER TABLE outcome_events ADD CONSTRAINT unique_org_idempotency UNIQUE (organization_id, idempotency_key);
    END IF;
END $$;

-- 5. Better indexing for the view join
CREATE INDEX IF NOT EXISTS idx_usage_events_org_key_time ON usage_events (organization_id, api_key_id, timestamp);

-- 6. Sync Watermarks (replaces MAX(captured_at))
CREATE TABLE IF NOT EXISTS provider_sync_state (
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    last_successful_sync_at TIMESTAMPTZ NOT NULL,
    latest_bucket_end TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (organization_id, provider)
);

-- 7. RPC Updates: TEXT casting for precision, UTC timezone, STABLE, and unpriced tracking
CREATE OR REPLACE FUNCTION aggregate_cost_and_outcomes(
    p_organization_id UUID,
    p_workload_id UUID,
    p_outcome_type TEXT,
    p_start_time TIMESTAMPTZ,
    p_end_time TIMESTAMPTZ
)
RETURNS TABLE (
    total_cost TEXT,
    total_outcomes TEXT,
    unpriced_events BIGINT
) AS $$
BEGIN
    RETURN QUERY
    WITH cost_agg AS (
        SELECT 
            COALESCE(SUM(calculated_cost), 0)::TEXT AS total_cost,
            SUM(CASE WHEN is_unpriced THEN 1 ELSE 0 END) AS unpriced_events
        FROM v_attributed_usage_events
        WHERE workload_id = p_workload_id
          AND timestamp >= p_start_time
          AND timestamp < p_end_time
          AND organization_id = p_organization_id
    ),
    outcome_agg AS (
        SELECT 
            COALESCE(SUM(count), 0)::TEXT AS total_outcomes
        FROM outcome_events
        WHERE workload_id = p_workload_id
          AND outcome_type = p_outcome_type
          AND timestamp >= p_start_time
          AND timestamp < p_end_time
          AND organization_id = p_organization_id
    )
    SELECT c.total_cost, o.total_outcomes, c.unpriced_events
    FROM cost_agg c, outcome_agg o;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER STABLE;

CREATE OR REPLACE FUNCTION aggregate_daily_cost_and_outcomes(
    p_organization_id UUID,
    p_workload_id UUID,
    p_outcome_type TEXT,
    p_start_time TIMESTAMPTZ,
    p_end_time TIMESTAMPTZ
)
RETURNS TABLE (
    period_start TIMESTAMPTZ,
    total_cost TEXT,
    total_outcomes TEXT,
    unpriced_events BIGINT
) AS $$
BEGIN
    RETURN QUERY
    WITH days AS (
        SELECT generate_series(
            date_trunc('day', p_start_time AT TIME ZONE 'UTC') AT TIME ZONE 'UTC',
            date_trunc('day', p_end_time AT TIME ZONE 'UTC') AT TIME ZONE 'UTC',
            '1 day'::interval
        ) AS day
    ),
    daily_cost AS (
        SELECT 
            date_trunc('day', timestamp AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AS day,
            SUM(calculated_cost) AS cost,
            SUM(CASE WHEN is_unpriced THEN 1 ELSE 0 END) AS unpriced_events
        FROM v_attributed_usage_events
        WHERE workload_id = p_workload_id
          AND timestamp >= p_start_time
          AND timestamp < p_end_time
          AND organization_id = p_organization_id
        GROUP BY 1
    ),
    daily_outcomes AS (
        SELECT 
            date_trunc('day', timestamp AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AS day,
            SUM(count) AS count
        FROM outcome_events
        WHERE workload_id = p_workload_id
          AND outcome_type = p_outcome_type
          AND timestamp >= p_start_time
          AND timestamp < p_end_time
          AND organization_id = p_organization_id
        GROUP BY 1
    )
    SELECT 
        d.day AS period_start,
        COALESCE(c.cost, 0)::TEXT AS total_cost,
        COALESCE(o.count, 0)::TEXT AS total_outcomes,
        COALESCE(c.unpriced_events, 0) AS unpriced_events
    FROM days d
    LEFT JOIN daily_cost c ON d.day = c.day
    LEFT JOIN daily_outcomes o ON d.day = o.day
    ORDER BY d.day ASC;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER STABLE;
-- 1. Ensure isolation
ALTER TABLE audit_findings ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

-- V0: safe to clear previous mock data if any, since it lacked org isolation and required fields
TRUNCATE TABLE audit_findings;

ALTER TABLE audit_findings ALTER COLUMN organization_id SET NOT NULL;

-- 2. Expand domain model
ALTER TABLE audit_findings ADD COLUMN IF NOT EXISTS severity TEXT NOT NULL;
ALTER TABLE audit_findings ADD COLUMN IF NOT EXISTS title TEXT NOT NULL;
ALTER TABLE audit_findings ADD COLUMN IF NOT EXISTS time_window_start TIMESTAMPTZ NOT NULL;
ALTER TABLE audit_findings ADD COLUMN IF NOT EXISTS time_window_end TIMESTAMPTZ NOT NULL;

-- Rename 'finding' to 'description' for clarity with new domain model, or keep it. Let's rename to description.
ALTER TABLE audit_findings RENAME COLUMN finding TO description;
ALTER TABLE audit_findings RENAME COLUMN timestamp TO detected_at;

-- 3. Idempotency Constraint
-- A workload shouldn't have duplicate findings of the same category for the exact same time window
CREATE UNIQUE INDEX unique_audit_finding_workload 
ON audit_findings (organization_id, workload_id, category, time_window_start, time_window_end)
WHERE workload_id IS NOT NULL;

CREATE UNIQUE INDEX unique_audit_finding_org 
ON audit_findings (organization_id, category, time_window_start, time_window_end)
WHERE workload_id IS NULL;

-- Safely add status column
ALTER TABLE audit_findings ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'OPEN';

-- Add constraints check for status
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'audit_findings_status_check'
    ) THEN
        ALTER TABLE audit_findings ADD CONSTRAINT audit_findings_status_check CHECK (status IN ('OPEN', 'DISMISSED', 'RESOLVED'));
    END IF;
END $$;
-- 1. Add request_count to usage_events
ALTER TABLE usage_events ADD COLUMN IF NOT EXISTS request_count BIGINT NOT NULL DEFAULT 1;

-- 2. Drop the old partial indexes and create a safe ON CONFLICT index using COALESCE
DROP INDEX IF EXISTS unique_audit_finding_workload;
DROP INDEX IF EXISTS unique_audit_finding_org;

CREATE UNIQUE INDEX IF NOT EXISTS unique_audit_finding_coalesced 
ON audit_findings (
    organization_id, 
    COALESCE(workload_id, '00000000-0000-0000-0000-000000000000'::uuid), 
    category, 
    time_window_start, 
    time_window_end
);

-- 3. RPC to securely UPSERT findings without overwriting STATUS
CREATE OR REPLACE FUNCTION upsert_audit_findings(p_findings JSONB)
RETURNS void AS $$
DECLARE
    f JSONB;
    v_org_id UUID;
    v_wl_id UUID;
BEGIN
    FOR f IN SELECT * FROM jsonb_array_elements(p_findings)
    LOOP
        v_org_id := (f->>'organization_id')::UUID;
        v_wl_id := NULLIF(f->>'workload_id', '')::UUID;
        
        INSERT INTO audit_findings (
            organization_id, workload_id, category, severity, title, description,
            confidence, evidence, time_window_start, time_window_end, detected_at, status
        ) VALUES (
            v_org_id,
            v_wl_id,
            f->>'category',
            f->>'severity',
            f->>'title',
            f->>'description',
            f->>'confidence',
            f->'evidence',
            (f->>'time_window_start')::TIMESTAMPTZ,
            (f->>'time_window_end')::TIMESTAMPTZ,
            NOW(),
            'OPEN'
        )
        ON CONFLICT (
            organization_id, 
            COALESCE(workload_id, '00000000-0000-0000-0000-000000000000'::uuid), 
            category, 
            time_window_start, 
            time_window_end
        )
        DO UPDATE SET
            evidence = EXCLUDED.evidence,
            severity = EXCLUDED.severity,
            confidence = EXCLUDED.confidence,
            description = EXCLUDED.description,
            title = EXCLUDED.title,
            detected_at = NOW(); -- Leave status alone!
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;

-- 4. RPC to aggregate metrics safely avoiding 1000-row PostgREST limits
CREATE OR REPLACE FUNCTION aggregate_audit_metrics(
    p_organization_id UUID,
    p_workload_id UUID,
    p_start_time TIMESTAMPTZ,
    p_end_time TIMESTAMPTZ
)
RETURNS TABLE (
    total_cost TEXT,
    total_tokens TEXT,
    request_count BIGINT,
    unpriced_events BIGINT,
    models JSONB
) AS $$
BEGIN
    RETURN QUERY
    WITH base AS (
        SELECT * FROM v_attributed_usage_events 
        WHERE workload_id = p_workload_id
          AND organization_id = p_organization_id
          AND timestamp >= p_start_time
          AND timestamp < p_end_time
    ),
    model_stats AS (
        SELECT 
            model,
            SUM(calculated_cost) as m_cost,
            SUM(input_tokens + output_tokens) as m_tokens,
            SUM(u.request_count) as m_reqs
        FROM base u
        GROUP BY model
    )
    SELECT 
        COALESCE(SUM(calculated_cost), 0)::TEXT AS total_cost,
        COALESCE(SUM(input_tokens + output_tokens), 0)::TEXT AS total_tokens,
        COALESCE(SUM(b.request_count), 0) AS request_count,
        COALESCE(SUM(CASE WHEN is_unpriced THEN 1 ELSE 0 END), 0) AS unpriced_events,
        (SELECT COALESCE(jsonb_object_agg(model, jsonb_build_object('cost', m_cost, 'tokens', m_tokens, 'requests', m_reqs)), '{}'::jsonb) FROM model_stats) AS models
    FROM base b;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER STABLE;
-- Create the function for updated_at triggers
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 1. monitoring_configs
CREATE TABLE monitoring_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    workload_id UUID REFERENCES workloads(id) ON DELETE CASCADE,
    enabled BOOLEAN NOT NULL DEFAULT true,
    config JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, workload_id) -- One config per org/workload pair
);

-- 2. monitoring_runs
CREATE TABLE monitoring_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    status TEXT NOT NULL,
    evaluated_workloads INTEGER NOT NULL DEFAULT 0,
    findings_count INTEGER NOT NULL DEFAULT 0,
    alerts_count INTEGER NOT NULL DEFAULT 0,
    error_info TEXT
);

-- 3. alerts
CREATE TABLE alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    workload_id UUID REFERENCES workloads(id) ON DELETE CASCADE,
    finding_id UUID REFERENCES audit_findings(id) ON DELETE SET NULL,
    category TEXT NOT NULL,
    severity TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('OPEN', 'ACKNOWLEDGED', 'RESOLVED')),
    fingerprint TEXT NOT NULL,
    notified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (fingerprint)
);

-- Trigger for updated_at
CREATE TRIGGER set_monitoring_configs_updated_at BEFORE UPDATE ON monitoring_configs FOR EACH ROW EXECUTE FUNCTION update_modified_column();
CREATE TRIGGER set_alerts_updated_at BEFORE UPDATE ON alerts FOR EACH ROW EXECUTE FUNCTION update_modified_column();
-- Phase 8 Hardening Migration

CREATE OR REPLACE FUNCTION sev_rank(sev TEXT) RETURNS INT AS $$
BEGIN
    CASE sev
        WHEN 'INFO' THEN RETURN 0;
        WHEN 'LOW' THEN RETURN 1;
        WHEN 'MEDIUM' THEN RETURN 2;
        WHEN 'HIGH' THEN RETURN 3;
        ELSE
            RAISE EXCEPTION 'Unknown severity level: %', sev;
    END CASE;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- D1: Atomic alert upsert RPC (race-free, handles escalation and reopen)
CREATE OR REPLACE FUNCTION upsert_alert(
    p_organization_id UUID,
    p_workload_id UUID,
    p_finding_id UUID,
    p_category TEXT,
    p_severity TEXT,
    p_fingerprint TEXT
)
RETURNS TABLE (
    alert_id UUID,
    was_created BOOLEAN,
    was_reopened BOOLEAN,
    was_escalated BOOLEAN,
    previous_severity TEXT,
    current_status TEXT
) AS $$
DECLARE
    v_alert_id UUID;
    v_old_status TEXT;
    v_old_severity TEXT;
    v_new_status TEXT;
    v_new_severity TEXT;
    v_attempts INT := 0;
BEGIN
    <<retry_loop>>
    LOOP
        v_attempts := v_attempts + 1;
        IF v_attempts > 10 THEN
            RAISE EXCEPTION 'upsert_alert failed after 10 concurrent retry attempts for fingerprint %', p_fingerprint;
        END IF;

        -- Lock row if it exists
        SELECT id, status, severity 
        INTO v_alert_id, v_old_status, v_old_severity
        FROM alerts 
        WHERE fingerprint = p_fingerprint 
        FOR UPDATE;

        IF FOUND THEN
            -- Calculate state transitions
            v_new_status := CASE WHEN v_old_status = 'RESOLVED' THEN 'OPEN' ELSE v_old_status END;
            
            -- Prevent severity regression, but allow overwrite if it's a reopen
            v_new_severity := CASE 
                WHEN sev_rank(p_severity) > sev_rank(v_old_severity) OR v_old_status = 'RESOLVED' THEN p_severity 
                ELSE v_old_severity 
            END;

            UPDATE alerts SET
                finding_id = p_finding_id,
                severity = v_new_severity,
                status = v_new_status,
                updated_at = NOW()
            WHERE id = v_alert_id;

            RETURN QUERY SELECT 
                v_alert_id, 
                FALSE, -- was_created
                (v_old_status = 'RESOLVED'), -- was_reopened
                (sev_rank(p_severity) > sev_rank(v_old_severity)), -- was_escalated
                v_old_severity, 
                v_new_status;
            EXIT retry_loop;
        ELSE
            BEGIN
                INSERT INTO alerts (
                    organization_id, workload_id, finding_id,
                    category, severity, status, fingerprint,
                    last_notified_severity
                ) VALUES (
                    p_organization_id, p_workload_id, p_finding_id,
                    p_category, p_severity, 'OPEN', p_fingerprint,
                    NULL
                ) RETURNING id INTO v_alert_id;
                
                RETURN QUERY SELECT 
                    v_alert_id, 
                    TRUE, -- was_created
                    FALSE, -- was_reopened
                    FALSE, -- was_escalated
                    NULL::TEXT, 
                    'OPEN'::TEXT;
                EXIT retry_loop;
            EXCEPTION WHEN unique_violation THEN
                -- A concurrent transaction inserted the row before us. Loop and lock it.
            END;
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;

-- D2: Add last_notified_severity to alerts for escalation tracking
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS last_notified_severity TEXT;

-- D5: Add CHECK constraint on monitoring_runs status
ALTER TABLE monitoring_runs DROP CONSTRAINT IF EXISTS monitoring_runs_status_check;
ALTER TABLE monitoring_runs ADD CONSTRAINT monitoring_runs_status_check
    CHECK (status IN ('RUNNING', 'COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED', 'TIMED_OUT'));

-- D5: Add CHECK constraint on alerts severity
ALTER TABLE alerts ADD CONSTRAINT alerts_severity_check
    CHECK (severity IN ('INFO', 'LOW', 'MEDIUM', 'HIGH'));

-- Index for alert queries (D1)
CREATE INDEX IF NOT EXISTS idx_alerts_org_status ON alerts (organization_id, status);

-- B5: Sync watermark table
CREATE TABLE IF NOT EXISTS provider_sync_state (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    last_successful_sync_at TIMESTAMPTZ,
    last_ingested_bucket_end TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, provider)
);

-- B4: Add updated_at and reprice_attempts to usage_events
ALTER TABLE usage_events ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE usage_events ADD COLUMN IF NOT EXISTS reprice_attempts INTEGER NOT NULL DEFAULT 0;

-- Trigger to keep usage_events updated_at fresh
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_usage_events_updated_at') THEN
        CREATE TRIGGER set_usage_events_updated_at 
        BEFORE UPDATE ON usage_events 
        FOR EACH ROW EXECUTE FUNCTION update_modified_column();
    END IF;
END $$;
-- Phase 9: Dashboard Aggregation Endpoints
-- Efficiently computes total cost and usage across all workloads for an organization.
CREATE OR REPLACE FUNCTION aggregate_dashboard_metrics(
    p_organization_id UUID,
    p_start_time TIMESTAMPTZ,
    p_end_time TIMESTAMPTZ
)
RETURNS TABLE (
    total_cost TEXT,
    total_tokens TEXT,
    request_count BIGINT,
    unpriced_events BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COALESCE(SUM(calculated_cost), 0)::TEXT AS total_cost,
        COALESCE(SUM(input_tokens + output_tokens + cache_read_tokens + cache_creation_tokens), 0)::TEXT AS total_tokens,
        COALESCE(SUM(request_count), 0) AS request_count,
        COALESCE(SUM(CASE WHEN is_unpriced THEN 1 ELSE 0 END), 0) AS unpriced_events
    FROM usage_events
    WHERE organization_id = p_organization_id
      AND timestamp >= p_start_time
      AND timestamp < p_end_time;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;

-- Daily trend aggregation for dashboard
CREATE OR REPLACE FUNCTION aggregate_dashboard_trends(
    p_organization_id UUID,
    p_start_time TIMESTAMPTZ,
    p_end_time TIMESTAMPTZ
)
RETURNS TABLE (
    period_start TIMESTAMPTZ,
    total_cost TEXT,
    total_tokens TEXT
) AS $$
BEGIN
    RETURN QUERY
    WITH days AS (
        SELECT generate_series(
            date_trunc('day', p_start_time),
            date_trunc('day', p_end_time - interval '1 microsecond'),
            '1 day'::interval
        ) AS day
    ),
    daily_stats AS (
        SELECT 
            date_trunc('day', timestamp) AS day,
            SUM(calculated_cost) AS cost,
            SUM(input_tokens + output_tokens + cache_read_tokens + cache_creation_tokens) AS tokens
        FROM usage_events
        WHERE organization_id = p_organization_id
          AND timestamp >= p_start_time
          AND timestamp < p_end_time
        GROUP BY 1
    )
    SELECT 
        d.day AS period_start,
        COALESCE(s.cost, 0)::TEXT AS total_cost,
        COALESCE(s.tokens, 0)::TEXT AS total_tokens
    FROM days d
    LEFT JOIN daily_stats s ON d.day = s.day
    ORDER BY d.day ASC;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;
