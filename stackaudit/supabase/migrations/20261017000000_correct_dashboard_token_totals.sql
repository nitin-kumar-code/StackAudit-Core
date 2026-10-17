-- Cache token columns are a breakdown of input_tokens, not additional tokens.
-- Keep the dashboard RPCs consistent with the canonical usage contract.
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
        COALESCE(SUM(calculated_cost), 0)::TEXT,
        COALESCE(SUM(input_tokens + output_tokens), 0)::TEXT,
        COALESCE(SUM(request_count), 0),
        COALESCE(SUM(CASE WHEN is_unpriced THEN 1 ELSE 0 END), 0)
    FROM usage_events
    WHERE organization_id = p_organization_id
      AND timestamp >= p_start_time
      AND timestamp < p_end_time;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER STABLE;

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
            SUM(input_tokens + output_tokens) AS tokens
        FROM usage_events
        WHERE organization_id = p_organization_id
          AND timestamp >= p_start_time
          AND timestamp < p_end_time
        GROUP BY 1
    )
    SELECT
        d.day,
        COALESCE(s.cost, 0)::TEXT,
        COALESCE(s.tokens, 0)::TEXT
    FROM days d
    LEFT JOIN daily_stats s ON d.day = s.day
    ORDER BY d.day ASC;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER STABLE;
