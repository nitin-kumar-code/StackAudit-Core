-- Add idempotency_key to outcome_events for safe retries
ALTER TABLE outcome_events ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

-- Enforce uniqueness of idempotency_key per workload
ALTER TABLE outcome_events DROP CONSTRAINT IF EXISTS unique_workload_idempotency;
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
DROP FUNCTION IF EXISTS aggregate_cost_and_outcomes(UUID, UUID, TEXT, TIMESTAMPTZ, TIMESTAMPTZ);

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
DROP FUNCTION IF EXISTS aggregate_daily_cost_and_outcomes(UUID, UUID, TEXT, TIMESTAMPTZ, TIMESTAMPTZ);

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
