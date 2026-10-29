-- Keep time-window analytics inside Postgres and return only bounded pages to
-- the application. All ranges use [start, end) and monetary values are text.

CREATE INDEX IF NOT EXISTS idx_usage_events_org_time_id
  ON usage_events (organization_id, timestamp DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_usage_events_org_provider_time_id
  ON usage_events (organization_id, provider, timestamp DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_usage_events_org_model_time_id
  ON usage_events (organization_id, model, timestamp DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_attribution_rules_org_workload
  ON attribution_rules (organization_id, workload_id, provider, match_type, match_value);
CREATE INDEX IF NOT EXISTS idx_outcome_events_org_time_workload
  ON outcome_events (organization_id, timestamp, workload_id);
CREATE INDEX IF NOT EXISTS idx_outcome_events_workload_time
  ON outcome_events (workload_id, timestamp);

CREATE OR REPLACE FUNCTION aggregate_usage_page(
  p_organization_id UUID,
  p_start_time TIMESTAMPTZ,
  p_end_time TIMESTAMPTZ,
  p_provider TEXT,
  p_model TEXT,
  p_workload_id UUID,
  p_page INTEGER,
  p_page_size INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  result JSONB;
BEGIN
  IF p_organization_id IS NULL OR p_start_time IS NULL OR p_end_time IS NULL
     OR p_start_time >= p_end_time THEN
    RAISE EXCEPTION 'A valid organization and non-empty time range are required';
  END IF;
  IF p_page IS NULL OR p_page < 1 OR p_page > 1000000 THEN
    RAISE EXCEPTION 'Page must be between 1 and 1000000';
  END IF;
  IF p_page_size IS NULL OR p_page_size < 1 OR p_page_size > 100 THEN
    RAISE EXCEPTION 'Page size must be between 1 and 100';
  END IF;

  WITH filtered AS NOT MATERIALIZED (
    SELECT usage.*, workload.name AS workload_name
    FROM v_attributed_usage_events AS usage
    LEFT JOIN workloads AS workload
      ON workload.id = usage.workload_id
     AND workload.organization_id = usage.organization_id
    WHERE usage.organization_id = p_organization_id
      AND usage.timestamp >= p_start_time
      AND usage.timestamp < p_end_time
      AND (p_provider IS NULL OR usage.provider = p_provider)
      AND (p_model IS NULL OR usage.model = p_model)
      AND (p_workload_id IS NULL OR usage.workload_id = p_workload_id)
  ),
  summary AS (
    SELECT
      COUNT(*)::BIGINT AS total_events,
      COALESCE(SUM(COALESCE(request_count, 1)), 0)::BIGINT AS total_requests,
      COALESCE(SUM(input_tokens::NUMERIC + output_tokens::NUMERIC), 0)::NUMERIC AS total_tokens,
      COALESCE(SUM(calculated_cost) FILTER (WHERE NOT is_unpriced), 0) AS known_cost,
      COUNT(*) FILTER (WHERE NOT is_unpriced)::BIGINT AS priced_events,
      COUNT(*) FILTER (WHERE is_unpriced)::BIGINT AS unpriced_events,
      COALESCE(array_agg(DISTINCT provider ORDER BY provider)
        FILTER (WHERE provider IS NOT NULL), ARRAY[]::TEXT[]) AS providers,
      COALESCE(array_agg(DISTINCT model ORDER BY model)
        FILTER (WHERE model IS NOT NULL), ARRAY[]::TEXT[]) AS models
    FROM filtered
  ),
  page_rows AS (
    SELECT *
    FROM filtered
    ORDER BY timestamp DESC, id DESC
    OFFSET ((p_page - 1)::BIGINT * p_page_size)
    LIMIT p_page_size
  ),
  page AS (
    SELECT COALESCE(
      jsonb_agg(
        to_jsonb(page_rows) || jsonb_build_object('calculated_cost', page_rows.calculated_cost::TEXT)
        ORDER BY timestamp DESC, id DESC
      ),
      '[]'::JSONB
    ) AS events
    FROM page_rows
  )
  SELECT jsonb_build_object(
    'events', page.events,
    'summary', jsonb_build_object(
      'totalRequests', summary.total_requests,
      'totalTokens', summary.total_tokens,
      'totalCost', CASE WHEN summary.unpriced_events > 0 THEN NULL ELSE summary.known_cost::TEXT END,
      'knownCost', CASE WHEN summary.priced_events > 0 OR summary.unpriced_events = 0
                        THEN summary.known_cost::TEXT ELSE NULL END,
      'isCostComplete', summary.unpriced_events = 0,
      'pricedEventCount', summary.priced_events,
      'unpricedEventCount', summary.unpriced_events,
      'totalEvents', summary.total_events
    ),
    'filters', jsonb_build_object(
      'providers', to_jsonb(summary.providers),
      'models', to_jsonb(summary.models),
      'workloads', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('id', workload.id, 'name', workload.name)
                         ORDER BY workload.name, workload.id)
        FROM workloads AS workload
        WHERE workload.organization_id = p_organization_id
      ), '[]'::JSONB)
    ),
    'pagination', jsonb_build_object(
      'page', p_page,
      'limit', p_page_size,
      'total', summary.total_events,
      'totalPages', CEIL(summary.total_events::NUMERIC / p_page_size)::BIGINT
    )
  )
  INTO result
  FROM summary CROSS JOIN page;

  RETURN result;
END;
$$;

-- Return global and per-workload dashboard totals in one usage scan. The
-- grouping set produces both workload buckets and the organization total;
-- unattributed usage is represented by the NULL workload bucket.
CREATE OR REPLACE FUNCTION aggregate_dashboard_summary(
  p_organization_id UUID,
  p_start_time TIMESTAMPTZ,
  p_end_time TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH usage_buckets AS (
    SELECT
      GROUPING(usage.workload_id) AS is_global,
      usage.workload_id,
      COALESCE(SUM(usage.calculated_cost) FILTER (WHERE NOT usage.is_unpriced), 0) AS known_cost,
      COUNT(*) FILTER (WHERE NOT usage.is_unpriced)::BIGINT AS priced_events,
      COUNT(*) FILTER (WHERE usage.is_unpriced)::BIGINT AS unpriced_events,
      COUNT(*)::BIGINT AS event_count,
      COALESCE(SUM(usage.input_tokens::NUMERIC + usage.output_tokens::NUMERIC), 0)::NUMERIC AS total_tokens,
      COALESCE(SUM(COALESCE(usage.request_count, 1)), 0)::BIGINT AS total_requests
    FROM v_attributed_usage_events AS usage
    WHERE usage.organization_id = p_organization_id
      AND usage.timestamp >= p_start_time
      AND usage.timestamp < p_end_time
    GROUP BY GROUPING SETS ((usage.workload_id), ())
  ),
  outcome_types AS (
    SELECT outcome.workload_id, outcome.outcome_type, SUM(outcome.count)::NUMERIC AS total_count
    FROM outcome_events AS outcome
    JOIN workloads AS workload
      ON workload.id = outcome.workload_id
     AND workload.organization_id = p_organization_id
    WHERE outcome.organization_id = p_organization_id
      AND outcome.timestamp >= p_start_time
      AND outcome.timestamp < p_end_time
    GROUP BY outcome.workload_id, outcome.outcome_type
  ),
  outcomes_by_workload AS (
    SELECT workload_id,
      SUM(total_count)::NUMERIC AS total_outcomes,
      jsonb_object_agg(outcome_type, total_count) AS outcome_types
    FROM outcome_types
    GROUP BY workload_id
  ),
  workload_rows AS (
    SELECT
      workload.id AS workload_id,
      workload.name AS workload_name,
      COALESCE(usage.known_cost, 0) AS known_cost,
      COALESCE(usage.priced_events, 0)::BIGINT AS priced_events,
      COALESCE(usage.unpriced_events, 0)::BIGINT AS unpriced_events,
      COALESCE(usage.event_count, 0)::BIGINT AS event_count,
      COALESCE(usage.total_tokens, 0)::NUMERIC AS total_tokens,
      COALESCE(usage.total_requests, 0)::BIGINT AS total_requests,
      COALESCE(outcomes.total_outcomes, 0)::NUMERIC AS total_outcomes,
      COALESCE(outcomes.outcome_types, '{}'::JSONB) AS outcome_types
    FROM workloads AS workload
    LEFT JOIN usage_buckets AS usage
      ON usage.is_global = 0 AND usage.workload_id = workload.id
    LEFT JOIN outcomes_by_workload AS outcomes ON outcomes.workload_id = workload.id
    WHERE workload.organization_id = p_organization_id
  ),
  unattributed_row AS (
    SELECT
      NULL::UUID AS workload_id,
      NULL::TEXT AS workload_name,
      COALESCE(usage.known_cost, 0) AS known_cost,
      COALESCE(usage.priced_events, 0)::BIGINT AS priced_events,
      COALESCE(usage.unpriced_events, 0)::BIGINT AS unpriced_events,
      COALESCE(usage.event_count, 0)::BIGINT AS event_count,
      COALESCE(usage.total_tokens, 0)::NUMERIC AS total_tokens,
      COALESCE(usage.total_requests, 0)::BIGINT AS total_requests,
      0::NUMERIC AS total_outcomes,
      '{}'::JSONB AS outcome_types
    FROM (SELECT 1) AS singleton
    LEFT JOIN usage_buckets AS usage
      ON usage.is_global = 0 AND usage.workload_id IS NULL
  ),
  grouped_workloads AS (
    SELECT * FROM workload_rows
    UNION ALL
    SELECT * FROM unattributed_row
  ),
  global_usage AS (
    SELECT * FROM usage_buckets WHERE is_global = 1
  ),
  summary AS (
    SELECT
      CASE WHEN global_usage.priced_events > 0 OR global_usage.unpriced_events = 0
           THEN global_usage.known_cost::TEXT ELSE NULL END AS known_cost,
      CASE WHEN global_usage.unpriced_events > 0 THEN NULL
           ELSE global_usage.known_cost::TEXT END AS total_cost,
      global_usage.unpriced_events = 0 AS is_cost_complete,
      global_usage.priced_events,
      global_usage.unpriced_events,
      global_usage.total_tokens,
      global_usage.total_requests,
      COALESCE((SELECT SUM(outcomes.total_outcomes)
                FROM outcomes_by_workload AS outcomes), 0)::NUMERIC AS total_outcomes,
      CASE WHEN unattributed.priced_events > 0 OR unattributed.unpriced_events = 0
           THEN unattributed.known_cost::TEXT ELSE NULL END AS unattributed_known_cost,
      CASE WHEN unattributed.unpriced_events > 0 THEN NULL
           ELSE unattributed.known_cost::TEXT END AS unattributed_cost,
      unattributed.unpriced_events = 0 AS unattributed_is_cost_complete,
      unattributed.event_count AS unattributed_event_count,
      CASE WHEN global_usage.priced_events - unattributed.priced_events > 0
                 OR global_usage.unpriced_events - unattributed.unpriced_events = 0
           THEN (global_usage.known_cost - unattributed.known_cost)::TEXT ELSE NULL END AS attributed_known_cost,
      CASE WHEN global_usage.unpriced_events - unattributed.unpriced_events > 0 THEN NULL
           ELSE (global_usage.known_cost - unattributed.known_cost)::TEXT END AS attributed_cost
    FROM global_usage
    CROSS JOIN unattributed_row AS unattributed
  )
  SELECT jsonb_build_object(
    'summary', jsonb_build_object(
      'totalCost', summary.total_cost,
      'knownCost', summary.known_cost,
      'isCostComplete', summary.is_cost_complete,
      'pricedEventCount', summary.priced_events,
      'unpricedEventCount', summary.unpriced_events,
      'totalTokens', summary.total_tokens,
      'totalRequests', summary.total_requests,
      'totalOutcomes', summary.total_outcomes,
      'attributedCost', summary.attributed_cost,
      'attributedKnownCost', summary.attributed_known_cost,
      'unattributedCost', summary.unattributed_cost,
      'unattributedKnownCost', summary.unattributed_known_cost,
      'unattributedIsCostComplete', summary.unattributed_is_cost_complete,
      'unattributedEventCount', summary.unattributed_event_count
    ),
    'workloads', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', workload.workload_id,
        'name', workload.workload_name,
        'knownCost', CASE WHEN workload.priced_events > 0 OR workload.unpriced_events = 0
                          THEN workload.known_cost::TEXT ELSE NULL END,
        'cost', CASE WHEN workload.unpriced_events > 0 THEN NULL ELSE workload.known_cost::TEXT END,
        'isCostComplete', workload.unpriced_events = 0,
        'pricedEventCount', workload.priced_events,
        'unpricedEventCount', workload.unpriced_events,
        'eventCount', workload.event_count,
        'usage', workload.total_tokens,
        'totalRequests', workload.total_requests,
        'outcomes', workload.total_outcomes,
        'outcomeTypes', workload.outcome_types
      ) ORDER BY workload.known_cost DESC, workload.workload_name, workload.workload_id)
      FROM grouped_workloads AS workload
      WHERE workload.workload_id IS NOT NULL
    ), '[]'::JSONB),
    'unattributed', (SELECT jsonb_build_object(
      'knownCost', CASE WHEN workload.priced_events > 0 OR workload.unpriced_events = 0
                        THEN workload.known_cost::TEXT ELSE NULL END,
      'cost', CASE WHEN workload.unpriced_events > 0 THEN NULL ELSE workload.known_cost::TEXT END,
      'isCostComplete', workload.unpriced_events = 0,
      'pricedEventCount', workload.priced_events,
      'unpricedEventCount', workload.unpriced_events,
      'eventCount', workload.event_count,
      'usage', workload.total_tokens,
      'totalRequests', workload.total_requests
    ) FROM grouped_workloads AS workload WHERE workload.workload_id IS NULL)
  )
  FROM summary;
$$;

-- Daily dashboard RPC v2 includes cost completeness, requests, and scoped
-- outcomes while keeping the previous RPC's return shape available.
CREATE FUNCTION aggregate_dashboard_trends_v2(
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
  total_tokens TEXT,
  request_count BIGINT,
  outcome_count TEXT
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
  daily_usage AS (
    SELECT date_trunc('day', usage.timestamp AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AS day,
      SUM(usage.calculated_cost) FILTER (WHERE NOT usage.is_unpriced) AS known_cost,
      COUNT(*) FILTER (WHERE NOT usage.is_unpriced)::BIGINT AS priced_events,
      COUNT(*) FILTER (WHERE usage.is_unpriced)::BIGINT AS unpriced_events,
      SUM(usage.input_tokens::NUMERIC + usage.output_tokens::NUMERIC)::NUMERIC AS total_tokens,
      SUM(COALESCE(usage.request_count, 1))::BIGINT AS request_count
    FROM usage_events AS usage
    WHERE usage.organization_id = p_organization_id
      AND usage.timestamp >= p_start_time
      AND usage.timestamp < p_end_time
    GROUP BY 1
  ),
  daily_outcomes AS (
    SELECT date_trunc('day', outcome.timestamp AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AS day,
      SUM(outcome.count)::NUMERIC AS outcome_count
    FROM outcome_events AS outcome
    JOIN workloads AS workload
      ON workload.id = outcome.workload_id
     AND workload.organization_id = p_organization_id
    WHERE outcome.organization_id = p_organization_id
      AND outcome.timestamp >= p_start_time
      AND outcome.timestamp < p_end_time
    GROUP BY 1
  )
  SELECT days.day,
    CASE WHEN COALESCE(daily_usage.priced_events, 0) > 0 OR COALESCE(daily_usage.unpriced_events, 0) = 0
         THEN COALESCE(daily_usage.known_cost, 0)::TEXT ELSE NULL END,
    CASE WHEN COALESCE(daily_usage.unpriced_events, 0) > 0
         THEN NULL ELSE COALESCE(daily_usage.known_cost, 0)::TEXT END,
    COALESCE(daily_usage.unpriced_events, 0) = 0,
    COALESCE(daily_usage.priced_events, 0),
    COALESCE(daily_usage.unpriced_events, 0),
    COALESCE(daily_usage.total_tokens, 0)::TEXT,
    COALESCE(daily_usage.request_count, 0),
    COALESCE(daily_outcomes.outcome_count, 0)::TEXT
  FROM days
  LEFT JOIN daily_usage ON daily_usage.day = days.day
  LEFT JOIN daily_outcomes ON daily_outcomes.day = days.day
  ORDER BY days.day;
$$;

-- Preserve the old three-column RPC contract for existing callers while
-- sharing the corrected v2 aggregation.
CREATE OR REPLACE FUNCTION aggregate_dashboard_trends(
  p_organization_id UUID,
  p_start_time TIMESTAMPTZ,
  p_end_time TIMESTAMPTZ
)
RETURNS TABLE (period_start TIMESTAMPTZ, total_cost TEXT, total_tokens TEXT)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT trend.period_start, trend.total_cost, trend.total_tokens
  FROM aggregate_dashboard_trends_v2(p_organization_id, p_start_time, p_end_time) AS trend;
$$;

-- Audit callers need known spend even when a window also contains unpriced
-- events so the audit rules can preserve their existing skip behavior.
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
    WHERE organization_id = p_organization_id
      AND workload_id = p_workload_id
      AND timestamp >= p_start_time
      AND timestamp < p_end_time
  ),
  model_totals AS (
    SELECT model,
      SUM(calculated_cost) FILTER (WHERE NOT is_unpriced) AS known_cost,
      SUM(input_tokens::NUMERIC + output_tokens::NUMERIC)::NUMERIC AS total_tokens,
      SUM(COALESCE(request_count, 1))::BIGINT AS request_count,
      COUNT(*) FILTER (WHERE is_unpriced)::BIGINT AS unpriced_events
    FROM usage_rows
    GROUP BY model
  ),
  usage_summary AS (
    SELECT COALESCE(SUM(calculated_cost) FILTER (WHERE NOT is_unpriced), 0) AS known_cost,
      COALESCE(SUM(input_tokens::NUMERIC + output_tokens::NUMERIC), 0)::NUMERIC AS total_tokens,
      COALESCE(SUM(COALESCE(request_count, 1)), 0)::BIGINT AS request_count,
      COUNT(*) FILTER (WHERE is_unpriced)::BIGINT AS unpriced_events
    FROM usage_rows
  ),
  outcome_totals AS (
    SELECT outcome_type, SUM(count)::NUMERIC AS total_count
    FROM outcome_events
    WHERE organization_id = p_organization_id
      AND workload_id = p_workload_id
      AND timestamp >= p_start_time
      AND timestamp < p_end_time
    GROUP BY outcome_type
  )
  SELECT usage_summary.known_cost::TEXT,
    usage_summary.total_tokens::TEXT,
    usage_summary.request_count,
    usage_summary.unpriced_events,
    COALESCE((SELECT jsonb_object_agg(model, jsonb_build_object(
      'known_cost', COALESCE(model_totals.known_cost, 0)::TEXT,
      'total_tokens', COALESCE(model_totals.total_tokens, 0)::TEXT,
      'request_count', model_totals.request_count,
      'unpriced_events', model_totals.unpriced_events
    )) FROM model_totals), '{}'::JSONB),
    COALESCE((SELECT jsonb_object_agg(outcome_type, total_count::TEXT)
              FROM outcome_totals), '{}'::JSONB)
  FROM usage_summary;
$$;

-- Batch the Outcomes page aggregation rather than loading all outcome events
-- and issuing one cost RPC per workload/type pair.
CREATE OR REPLACE FUNCTION aggregate_outcome_analytics(
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
  unpriced_events BIGINT
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
    WHERE organization_id = p_organization_id
      AND workload_id IS NOT NULL
      AND timestamp >= p_start_time
      AND timestamp < p_end_time
    GROUP BY workload_id
  ),
  outcomes_by_type AS (
    SELECT outcome.workload_id, outcome.outcome_type,
      SUM(outcome.count)::NUMERIC AS total_outcomes,
      workload.name AS workload_name
    FROM outcome_events AS outcome
    JOIN workloads AS workload
      ON workload.id = outcome.workload_id
     AND workload.organization_id = p_organization_id
    WHERE outcome.organization_id = p_organization_id
      AND outcome.timestamp >= p_start_time
      AND outcome.timestamp < p_end_time
    GROUP BY outcome.workload_id, outcome.outcome_type, workload.name
  )
  SELECT outcomes.workload_id,
    outcomes.workload_name,
    outcomes.outcome_type,
    outcomes.total_outcomes::TEXT,
    CASE WHEN COALESCE(usage.priced_events, 0) > 0 OR COALESCE(usage.unpriced_events, 0) = 0
         THEN COALESCE(usage.known_cost, 0)::TEXT ELSE NULL END,
    CASE WHEN COALESCE(usage.unpriced_events, 0) > 0
         THEN NULL ELSE COALESCE(usage.known_cost, 0)::TEXT END,
    COALESCE(usage.unpriced_events, 0) = 0,
    COALESCE(usage.priced_events, 0),
    COALESCE(usage.unpriced_events, 0)
  FROM outcomes_by_type AS outcomes
  LEFT JOIN usage_by_workload AS usage ON usage.workload_id = outcomes.workload_id
  ORDER BY outcomes.workload_name, outcomes.outcome_type, outcomes.workload_id;
$$;

REVOKE ALL ON FUNCTION aggregate_usage_page(UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, UUID, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION aggregate_usage_page(UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, UUID, INTEGER, INTEGER) TO service_role;
REVOKE ALL ON FUNCTION aggregate_dashboard_summary(UUID, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION aggregate_dashboard_summary(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;
REVOKE ALL ON FUNCTION aggregate_dashboard_trends_v2(UUID, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION aggregate_dashboard_trends_v2(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;
REVOKE ALL ON FUNCTION aggregate_audit_window_v2(UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION aggregate_audit_window_v2(UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;
REVOKE ALL ON FUNCTION aggregate_outcome_analytics(UUID, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION aggregate_outcome_analytics(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;
