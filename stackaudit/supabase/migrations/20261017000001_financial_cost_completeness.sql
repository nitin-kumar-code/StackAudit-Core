-- Report only priced monetary values as authoritative totals. The historic
-- calculated_cost=0 placeholder remains for schema compatibility, but is never
-- included in known cost when is_unpriced is true.

DROP FUNCTION IF EXISTS aggregate_cost_and_outcomes(UUID, UUID, TEXT, TIMESTAMPTZ, TIMESTAMPTZ);
CREATE FUNCTION aggregate_cost_and_outcomes(
    p_organization_id UUID,
    p_workload_id UUID,
    p_outcome_type TEXT,
    p_start_time TIMESTAMPTZ,
    p_end_time TIMESTAMPTZ
)
RETURNS TABLE (
    known_cost TEXT,
    total_cost TEXT,
    total_outcomes TEXT,
    unpriced_events BIGINT,
    priced_events BIGINT
) AS $$
BEGIN
    RETURN QUERY
    WITH cost_agg AS (
        SELECT
            COALESCE(SUM(calculated_cost) FILTER (WHERE NOT is_unpriced), 0)::TEXT AS known_cost,
            COUNT(*) FILTER (WHERE is_unpriced)::BIGINT AS unpriced_count,
            COUNT(*) FILTER (WHERE NOT is_unpriced)::BIGINT AS priced_count
        FROM v_attributed_usage_events
        WHERE workload_id = p_workload_id
          AND organization_id = p_organization_id
          AND timestamp >= p_start_time
          AND timestamp < p_end_time
    ),
    outcome_agg AS (
        SELECT COALESCE(SUM(count), 0)::TEXT AS outcomes
        FROM outcome_events
        WHERE workload_id = p_workload_id
          AND organization_id = p_organization_id
          AND outcome_type = p_outcome_type
          AND timestamp >= p_start_time
          AND timestamp < p_end_time
    )
    SELECT c.known_cost,
           CASE WHEN c.unpriced_count > 0 THEN NULL ELSE c.known_cost END,
           o.outcomes, c.unpriced_count, c.priced_count
    FROM cost_agg c CROSS JOIN outcome_agg o;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER STABLE;

DROP FUNCTION IF EXISTS aggregate_daily_cost_and_outcomes(UUID, UUID, TEXT, TIMESTAMPTZ, TIMESTAMPTZ);
CREATE FUNCTION aggregate_daily_cost_and_outcomes(
    p_organization_id UUID,
    p_workload_id UUID,
    p_outcome_type TEXT,
    p_start_time TIMESTAMPTZ,
    p_end_time TIMESTAMPTZ
)
RETURNS TABLE (
    period_start TIMESTAMPTZ,
    known_cost TEXT,
    total_cost TEXT,
    total_outcomes TEXT,
    unpriced_events BIGINT,
    priced_events BIGINT
) AS $$
BEGIN
    RETURN QUERY
    WITH days AS (
        SELECT generate_series(
            date_trunc('day', p_start_time AT TIME ZONE 'UTC') AT TIME ZONE 'UTC',
            date_trunc('day', (p_end_time - interval '1 microsecond') AT TIME ZONE 'UTC') AT TIME ZONE 'UTC',
            '1 day'::interval
        ) AS day
    ),
    daily_cost AS (
        SELECT
            date_trunc('day', timestamp AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AS day,
            SUM(calculated_cost) FILTER (WHERE NOT is_unpriced) AS known_cost,
            COUNT(*) FILTER (WHERE is_unpriced)::BIGINT AS unpriced_count,
            COUNT(*) FILTER (WHERE NOT is_unpriced)::BIGINT AS priced_count
        FROM v_attributed_usage_events
        WHERE workload_id = p_workload_id
          AND organization_id = p_organization_id
          AND timestamp >= p_start_time
          AND timestamp < p_end_time
        GROUP BY 1
    ),
    daily_outcomes AS (
        SELECT
            date_trunc('day', timestamp AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AS day,
            SUM(count) AS outcome_count
        FROM outcome_events
        WHERE workload_id = p_workload_id
          AND organization_id = p_organization_id
          AND outcome_type = p_outcome_type
          AND timestamp >= p_start_time
          AND timestamp < p_end_time
        GROUP BY 1
    )
    SELECT
        d.day,
        COALESCE(c.known_cost, 0)::TEXT,
        CASE WHEN COALESCE(c.unpriced_count, 0) > 0 THEN NULL
             ELSE COALESCE(c.known_cost, 0)::TEXT END,
        COALESCE(o.outcome_count, 0)::TEXT,
        COALESCE(c.unpriced_count, 0),
        COALESCE(c.priced_count, 0)
    FROM days d
    LEFT JOIN daily_cost c ON d.day = c.day
    LEFT JOIN daily_outcomes o ON d.day = o.day
    ORDER BY d.day;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER STABLE;

DROP FUNCTION IF EXISTS aggregate_dashboard_metrics(UUID, TIMESTAMPTZ, TIMESTAMPTZ);
CREATE FUNCTION aggregate_dashboard_metrics(
    p_organization_id UUID,
    p_start_time TIMESTAMPTZ,
    p_end_time TIMESTAMPTZ
)
RETURNS TABLE (
    known_cost TEXT,
    total_cost TEXT,
    is_cost_complete BOOLEAN,
    priced_events BIGINT,
    unpriced_events BIGINT,
    total_tokens TEXT,
    request_count BIGINT
) AS $$
    WITH costs AS (
        SELECT
            COALESCE(SUM(calculated_cost) FILTER (WHERE NOT is_unpriced), 0) AS known_cost,
            COUNT(*) FILTER (WHERE NOT is_unpriced)::BIGINT AS priced_count,
            COUNT(*) FILTER (WHERE is_unpriced)::BIGINT AS unpriced_count
        FROM usage_events
        WHERE organization_id = p_organization_id
          AND timestamp >= p_start_time
          AND timestamp < p_end_time
    ),
    usage AS (
        SELECT
            COALESCE(SUM(input_tokens + output_tokens), 0)::TEXT AS tokens,
            COALESCE(SUM(request_count), 0)::BIGINT AS requests
        FROM usage_events
        WHERE organization_id = p_organization_id
          AND timestamp >= p_start_time
          AND timestamp < p_end_time
    )
    SELECT
        CASE WHEN c.priced_count > 0 OR c.unpriced_count = 0 THEN c.known_cost::TEXT ELSE NULL END,
        CASE WHEN c.unpriced_count > 0 THEN NULL ELSE c.known_cost::TEXT END,
        c.unpriced_count = 0,
        c.priced_count,
        c.unpriced_count,
        u.tokens,
        u.requests
    FROM costs c CROSS JOIN usage u;
$$ LANGUAGE sql SECURITY INVOKER STABLE;

DROP FUNCTION IF EXISTS aggregate_dashboard_trends(UUID, TIMESTAMPTZ, TIMESTAMPTZ);
CREATE FUNCTION aggregate_dashboard_trends(
    p_organization_id UUID,
    p_start_time TIMESTAMPTZ,
    p_end_time TIMESTAMPTZ
)
RETURNS TABLE (
    period_start TIMESTAMPTZ,
    known_cost TEXT,
    total_cost TEXT,
    is_cost_complete BOOLEAN,
    priced_events BIGINT,
    unpriced_events BIGINT,
    total_tokens TEXT
) AS $$
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
            SUM(calculated_cost) FILTER (WHERE NOT is_unpriced) AS known_cost,
            COUNT(*) FILTER (WHERE NOT is_unpriced)::BIGINT AS priced_count,
            COUNT(*) FILTER (WHERE is_unpriced)::BIGINT AS unpriced_count,
            SUM(input_tokens + output_tokens) AS tokens
        FROM usage_events
        WHERE organization_id = p_organization_id
          AND timestamp >= p_start_time
          AND timestamp < p_end_time
        GROUP BY 1
    )
    SELECT
        d.day,
        CASE WHEN COALESCE(s.priced_count, 0) > 0 OR COALESCE(s.unpriced_count, 0) = 0
             THEN COALESCE(s.known_cost, 0)::TEXT ELSE NULL END,
        CASE WHEN COALESCE(s.unpriced_count, 0) > 0 THEN NULL
             ELSE COALESCE(s.known_cost, 0)::TEXT END,
        COALESCE(s.unpriced_count, 0) = 0,
        COALESCE(s.priced_count, 0),
        COALESCE(s.unpriced_count, 0),
        COALESCE(s.tokens, 0)::TEXT
    FROM days d
    LEFT JOIN daily_stats s ON d.day = s.day
    ORDER BY d.day;
$$ LANGUAGE sql SECURITY INVOKER STABLE;

-- Keep the legacy audit RPC safe for any downstream caller: its total is NULL
-- when pricing is incomplete, and model costs exclude placeholder rows.
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
        SELECT model,
            SUM(calculated_cost) FILTER (WHERE NOT is_unpriced) AS m_cost,
            SUM(input_tokens + output_tokens) AS m_tokens,
            SUM(request_count) AS m_reqs,
            COUNT(*) FILTER (WHERE is_unpriced) AS m_unpriced
        FROM base GROUP BY model
    ),
    totals AS (
        SELECT COALESCE(SUM(calculated_cost) FILTER (WHERE NOT is_unpriced), 0) AS known_cost,
            COUNT(*) FILTER (WHERE is_unpriced) AS unpriced_count,
            COALESCE(SUM(input_tokens + output_tokens), 0) AS token_count,
            COALESCE(SUM(request_count), 0) AS requests
        FROM base
    )
    SELECT CASE WHEN t.unpriced_count > 0 THEN NULL ELSE t.known_cost::TEXT END,
        t.token_count::TEXT, t.requests::BIGINT, t.unpriced_count::BIGINT,
        (SELECT COALESCE(jsonb_object_agg(model, jsonb_build_object(
            'cost', m_cost, 'tokens', m_tokens, 'requests', m_reqs, 'unpriced_events', m_unpriced
        )), '{}'::JSONB) FROM model_stats)
    FROM totals t;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER STABLE;
