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
