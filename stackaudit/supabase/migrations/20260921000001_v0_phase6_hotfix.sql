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
