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
