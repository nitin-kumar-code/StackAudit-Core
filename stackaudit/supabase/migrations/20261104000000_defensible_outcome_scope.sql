-- A workload's full usage cost cannot be assigned to one outcome type when
-- multiple types exist in the same window. Return the count of outcome types
-- alongside counts/costs so the shared TypeScript metric can suppress an
-- unsupported cost-per-outcome ratio. All timestamps remain [start, end).

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
  priced_events BIGINT,
  outcome_type_count BIGINT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH cost_aggregate AS (
    SELECT
      COALESCE(SUM(calculated_cost) FILTER (WHERE NOT is_unpriced), 0)::TEXT AS known_cost,
      COUNT(*) FILTER (WHERE is_unpriced)::BIGINT AS unpriced_events,
      COUNT(*) FILTER (WHERE NOT is_unpriced)::BIGINT AS priced_events
    FROM v_attributed_usage_events
    WHERE organization_id = p_organization_id
      AND workload_id = p_workload_id
      AND timestamp >= p_start_time AND timestamp < p_end_time
  ),
  outcome_aggregate AS (
    SELECT
      COALESCE(SUM(count) FILTER (WHERE outcome_type = p_outcome_type), 0)::TEXT AS total_outcomes,
      COUNT(DISTINCT outcome_type)::BIGINT AS outcome_type_count
    FROM outcome_events
    WHERE organization_id = p_organization_id
      AND workload_id = p_workload_id
      AND timestamp >= p_start_time AND timestamp < p_end_time
  )
  SELECT CASE WHEN cost.priced_events = 0 AND cost.unpriced_events > 0 THEN NULL ELSE cost.known_cost END,
    CASE WHEN cost.unpriced_events > 0 THEN NULL ELSE cost.known_cost END,
    outcome.total_outcomes,
    cost.unpriced_events,
    cost.priced_events,
    outcome.outcome_type_count
  FROM cost_aggregate AS cost CROSS JOIN outcome_aggregate AS outcome;
$$;

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
  priced_events BIGINT,
  outcome_type_count BIGINT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH days AS (
    SELECT generate_series(
      date_trunc('day', p_start_time AT TIME ZONE 'UTC') AT TIME ZONE 'UTC',
      date_trunc('day', (p_end_time - INTERVAL '1 microsecond') AT TIME ZONE 'UTC') AT TIME ZONE 'UTC',
      INTERVAL '1 day'
    ) AS day
  ),
  daily_cost AS (
    SELECT date_trunc('day', timestamp AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AS day,
      COALESCE(SUM(calculated_cost) FILTER (WHERE NOT is_unpriced), 0)::TEXT AS known_cost,
      COUNT(*) FILTER (WHERE is_unpriced)::BIGINT AS unpriced_events,
      COUNT(*) FILTER (WHERE NOT is_unpriced)::BIGINT AS priced_events
    FROM v_attributed_usage_events
    WHERE organization_id = p_organization_id AND workload_id = p_workload_id
      AND timestamp >= p_start_time AND timestamp < p_end_time
    GROUP BY 1
  ),
  daily_outcomes AS (
    SELECT date_trunc('day', timestamp AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AS day,
      COALESCE(SUM(count) FILTER (WHERE outcome_type = p_outcome_type), 0)::TEXT AS total_outcomes,
      COUNT(DISTINCT outcome_type)::BIGINT AS outcome_type_count
    FROM outcome_events
    WHERE organization_id = p_organization_id AND workload_id = p_workload_id
      AND timestamp >= p_start_time AND timestamp < p_end_time
    GROUP BY 1
  )
  SELECT days.day,
    CASE WHEN COALESCE(cost.priced_events, 0) > 0 OR COALESCE(cost.unpriced_events, 0) = 0
         THEN COALESCE(cost.known_cost, '0') ELSE NULL END,
    CASE WHEN COALESCE(cost.unpriced_events, 0) > 0 THEN NULL ELSE COALESCE(cost.known_cost, '0') END,
    COALESCE(outcome.total_outcomes, '0'),
    COALESCE(cost.unpriced_events, 0),
    COALESCE(cost.priced_events, 0),
    COALESCE(outcome.outcome_type_count, 0)
  FROM days
  LEFT JOIN daily_cost AS cost ON cost.day = days.day
  LEFT JOIN daily_outcomes AS outcome ON outcome.day = days.day
  ORDER BY days.day;
$$;

DROP FUNCTION IF EXISTS aggregate_outcome_analytics(UUID, TIMESTAMPTZ, TIMESTAMPTZ);
CREATE FUNCTION aggregate_outcome_analytics(
  p_organization_id UUID,
  p_start_time TIMESTAMPTZ,
  p_end_time TIMESTAMPTZ
)
RETURNS TABLE (
  workload_id UUID,
  workload_name TEXT,
  outcome_type TEXT,
  total_outcomes TEXT,
  known_cost TEXT,
  total_cost TEXT,
  is_cost_complete BOOLEAN,
  priced_events BIGINT,
  unpriced_events BIGINT,
  outcome_type_count BIGINT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH usage_by_workload AS (
    SELECT workload_id,
      COALESCE(SUM(calculated_cost) FILTER (WHERE NOT is_unpriced), 0) AS known_cost,
      COUNT(*) FILTER (WHERE NOT is_unpriced)::BIGINT AS priced_events,
      COUNT(*) FILTER (WHERE is_unpriced)::BIGINT AS unpriced_events
    FROM v_attributed_usage_events
    WHERE organization_id = p_organization_id AND workload_id IS NOT NULL
      AND timestamp >= p_start_time AND timestamp < p_end_time
    GROUP BY workload_id
  ),
  outcome_rows AS (
    SELECT workload_id, outcome_type, SUM(count)::NUMERIC AS total_outcomes
    FROM outcome_events
    WHERE organization_id = p_organization_id
      AND timestamp >= p_start_time AND timestamp < p_end_time
    GROUP BY workload_id, outcome_type
  ),
  outcomes AS (
    SELECT outcome.workload_id, outcome.outcome_type, outcome.total_outcomes,
      COUNT(*) OVER (PARTITION BY outcome.workload_id)::BIGINT AS outcome_type_count,
      workload.name AS workload_name
    FROM outcome_rows AS outcome
    JOIN workloads AS workload
      ON workload.id = outcome.workload_id
     AND workload.organization_id = p_organization_id
  )
  SELECT outcome.workload_id,
    outcome.workload_name,
    outcome.outcome_type,
    outcome.total_outcomes::TEXT,
    CASE WHEN COALESCE(usage.priced_events, 0) > 0 OR COALESCE(usage.unpriced_events, 0) = 0
         THEN COALESCE(usage.known_cost, 0)::TEXT ELSE NULL END,
    CASE WHEN COALESCE(usage.unpriced_events, 0) > 0 THEN NULL
         ELSE COALESCE(usage.known_cost, 0)::TEXT END,
    COALESCE(usage.unpriced_events, 0) = 0,
    COALESCE(usage.priced_events, 0),
    COALESCE(usage.unpriced_events, 0),
    outcome.outcome_type_count
  FROM outcomes AS outcome
  LEFT JOIN usage_by_workload AS usage ON usage.workload_id = outcome.workload_id
  ORDER BY outcome.workload_name, outcome.outcome_type, outcome.workload_id;
$$;

-- Preserve unknown as NULL in audit inputs when every event is unpriced. A
-- partial priced subtotal remains available alongside unpriced_events.
CREATE OR REPLACE FUNCTION aggregate_audit_window_v2(
  p_organization_id UUID,
  p_workload_id UUID,
  p_start_time TIMESTAMPTZ,
  p_end_time TIMESTAMPTZ
)
RETURNS TABLE (
  known_cost TEXT,
  total_tokens TEXT,
  request_count BIGINT,
  unpriced_events BIGINT,
  models JSONB,
  outcomes JSONB
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH usage_rows AS (
    SELECT model, calculated_cost, is_unpriced, input_tokens, output_tokens, request_count
    FROM v_attributed_usage_events
    WHERE organization_id = p_organization_id AND workload_id = p_workload_id
      AND timestamp >= p_start_time AND timestamp < p_end_time
  ),
  model_totals AS (
    SELECT model,
      COALESCE(SUM(calculated_cost) FILTER (WHERE NOT is_unpriced), 0) AS known_cost,
      SUM(input_tokens::NUMERIC + output_tokens::NUMERIC)::NUMERIC AS total_tokens,
      SUM(COALESCE(request_count, 1))::BIGINT AS request_count,
      COUNT(*) FILTER (WHERE is_unpriced)::BIGINT AS unpriced_events,
      COUNT(*) FILTER (WHERE NOT is_unpriced)::BIGINT AS priced_events
    FROM usage_rows GROUP BY model
  ),
  usage_summary AS (
    SELECT COALESCE(SUM(calculated_cost) FILTER (WHERE NOT is_unpriced), 0) AS known_cost,
      COALESCE(SUM(input_tokens::NUMERIC + output_tokens::NUMERIC), 0)::NUMERIC AS total_tokens,
      COALESCE(SUM(COALESCE(request_count, 1)), 0)::BIGINT AS request_count,
      COUNT(*) FILTER (WHERE is_unpriced)::BIGINT AS unpriced_events,
      COUNT(*) FILTER (WHERE NOT is_unpriced)::BIGINT AS priced_events
    FROM usage_rows
  ),
  outcome_totals AS (
    SELECT outcome_type, SUM(count)::NUMERIC AS total_count
    FROM outcome_events
    WHERE organization_id = p_organization_id AND workload_id = p_workload_id
      AND timestamp >= p_start_time AND timestamp < p_end_time
    GROUP BY outcome_type
  )
  SELECT CASE WHEN usage_summary.priced_events = 0 AND usage_summary.unpriced_events > 0
              THEN NULL ELSE usage_summary.known_cost::TEXT END,
    usage_summary.total_tokens::TEXT,
    usage_summary.request_count,
    usage_summary.unpriced_events,
    COALESCE((SELECT jsonb_object_agg(model, jsonb_build_object(
      'known_cost', CASE WHEN model_totals.priced_events = 0 AND model_totals.unpriced_events > 0
                         THEN NULL ELSE model_totals.known_cost::TEXT END,
      'total_tokens', COALESCE(model_totals.total_tokens, 0)::TEXT,
      'request_count', model_totals.request_count,
      'unpriced_events', model_totals.unpriced_events
    )) FROM model_totals), '{}'::JSONB),
    COALESCE((SELECT jsonb_object_agg(outcome_type, total_count::TEXT) FROM outcome_totals), '{}'::JSONB)
  FROM usage_summary;
$$;

REVOKE ALL ON FUNCTION aggregate_cost_and_outcomes(UUID, UUID, TEXT, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION aggregate_cost_and_outcomes(UUID, UUID, TEXT, TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;
REVOKE ALL ON FUNCTION aggregate_daily_cost_and_outcomes(UUID, UUID, TEXT, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION aggregate_daily_cost_and_outcomes(UUID, UUID, TEXT, TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;
REVOKE ALL ON FUNCTION aggregate_outcome_analytics(UUID, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION aggregate_outcome_analytics(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;
