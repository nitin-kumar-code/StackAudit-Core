BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT extensions.plan(19);

-- Isolated deterministic rows exercise actual PostgreSQL records and RPCs.
INSERT INTO organizations (id, name) VALUES
  ('00000000-0000-4000-a000-000000000001', 'Analytics reconciliation fixture'),
  ('00000000-0000-4000-a000-000000000002', 'Separate organization fixture');
INSERT INTO workloads (id, organization_id, name) VALUES
  ('00000000-0000-4000-a000-000000000011', '00000000-0000-4000-a000-000000000001', 'Priced and unpriced'),
  ('00000000-0000-4000-a000-000000000012', '00000000-0000-4000-a000-000000000001', 'Priced with outcomes'),
  ('00000000-0000-4000-a000-000000000013', '00000000-0000-4000-a000-000000000001', 'Outcomes only'),
  ('00000000-0000-4000-a000-000000000014', '00000000-0000-4000-a000-000000000001', 'Cost only'),
  ('00000000-0000-4000-a000-000000000015', '00000000-0000-4000-a000-000000000001', 'Unpriced only');
INSERT INTO attribution_rules (organization_id, workload_id, provider, match_type, match_value) VALUES
  ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000011', 'openai', 'api_key', 'fixture-a'),
  ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000012', 'anthropic', 'api_key', 'fixture-b'),
  ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000014', 'openai', 'api_key', 'fixture-cost-only'),
  ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000015', 'all-unpriced', 'api_key', 'fixture-unpriced-only');

INSERT INTO usage_events (
  id, organization_id, provider, model, timestamp, input_tokens, output_tokens,
  cache_read_tokens, cache_creation_tokens, request_count, provider_reference,
  api_key_id, calculated_cost, raw_response_hash, is_unpriced
) VALUES
  ('10000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000001', 'openai', 'gpt-fixture', '2026-11-01T00:00:00Z', 10, 5, 3, 1, 3, 'fixture-a-1', 'fixture-a', 1.25, 'fixture', false),
  ('10000000-0000-4000-a000-000000000002', '00000000-0000-4000-a000-000000000001', 'openai', 'gpt-fixture', '2026-11-01T01:00:00Z', 4, 2, 2, 0, 2, 'fixture-a-2', 'fixture-a', 0, 'fixture', true),
  ('10000000-0000-4000-a000-000000000003', '00000000-0000-4000-a000-000000000001', 'anthropic', 'claude-fixture', '2026-11-03T12:00:00Z', 6, 3, 0, 0, 1, 'fixture-b-1', 'fixture-b', 2.00, 'fixture', false),
  ('10000000-0000-4000-a000-000000000004', '00000000-0000-4000-a000-000000000001', 'openai', 'gpt-fixture', '2026-11-02T12:00:00Z', 4, 1, 0, 0, 1, 'fixture-d-1', 'fixture-cost-only', 0.75, 'fixture', false),
  ('10000000-0000-4000-a000-000000000005', '00000000-0000-4000-a000-000000000001', 'openai', 'gpt-fixture', '2026-11-01T02:00:00Z', 2, 1, 0, 0, 1, 'fixture-unattributed', 'no-rule', 0.50, 'fixture', false),
  ('10000000-0000-4000-a000-000000000006', '00000000-0000-4000-a000-000000000001', 'openai', 'gpt-fixture', '2026-11-06T00:00:00Z', 100, 50, 0, 0, 10, 'fixture-at-end', 'fixture-a', 100, 'fixture', false),
  ('10000000-0000-4000-a000-000000000007', '00000000-0000-4000-a000-000000000002', 'openai', 'other-org', '2026-11-01T01:00:00Z', 900, 100, 0, 0, 100, 'other-org-only', NULL, 999, 'fixture', false),
  ('10000000-0000-4000-a000-000000000008', '00000000-0000-4000-a000-000000000001', 'all-unpriced', 'unknown-model', '2026-11-02T12:00:00Z', 8, 1, 0, 0, 4, 'fixture-unpriced-only', 'fixture-unpriced-only', 0, 'fixture', true);

INSERT INTO outcome_events (id, organization_id, workload_id, outcome_type, timestamp, count) VALUES
  ('20000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000011', 'ticket_resolved', '2026-11-01T00:00:00Z', 2),
  ('20000000-0000-4000-a000-000000000002', '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000011', 'lead_created', '2026-11-01T12:00:00Z', 1),
  ('20000000-0000-4000-a000-000000000003', '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000012', 'ticket_resolved', '2026-11-03T12:00:00Z', 3),
  ('20000000-0000-4000-a000-000000000004', '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000013', 'ticket_resolved', '2026-11-04T12:00:00Z', 4),
  ('20000000-0000-4000-a000-000000000005', '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000013', 'lead_created', '2026-11-04T13:00:00Z', 6),
  ('20000000-0000-4000-a000-000000000006', '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000012', 'ticket_resolved', '2026-11-06T00:00:00Z', 100);

SELECT extensions.is(
  (SELECT count(*)::BIGINT FROM usage_events WHERE organization_id = '00000000-0000-4000-a000-000000000001' AND timestamp >= '2026-11-01T00:00:00Z' AND timestamp < '2026-11-06T00:00:00Z'),
  6::BIGINT,
  'half-open SQL window includes the start and excludes the end'
);
SELECT extensions.is(
  (SELECT (aggregate_dashboard_summary('00000000-0000-4000-a000-000000000001', '2026-11-01T00:00:00Z', '2026-11-06T00:00:00Z')->'summary'->>'totalTokens')::NUMERIC),
  47::NUMERIC,
  'dashboard token total excludes cache subsets and end-boundary event'
);
SELECT extensions.is(
  (SELECT (aggregate_dashboard_summary('00000000-0000-4000-a000-000000000001', '2026-11-01T00:00:00Z', '2026-11-06T00:00:00Z')->'summary'->>'totalRequests')::BIGINT),
  12::BIGINT,
  'dashboard request count reconciles priced, unpriced, and unattributed records'
);
SELECT extensions.is(
  aggregate_dashboard_summary('00000000-0000-4000-a000-000000000001', '2026-11-01T00:00:00Z', '2026-11-06T00:00:00Z')->'summary'->>'knownCost',
  '4.50',
  'known cost sums only priced events'
);
SELECT extensions.is(
  aggregate_dashboard_summary('00000000-0000-4000-a000-000000000001', '2026-11-01T00:00:00Z', '2026-11-06T00:00:00Z')->'summary'->>'totalCost',
  NULL::TEXT,
  'partial cost is never represented as a complete total'
);
SELECT extensions.is(
  (SELECT (aggregate_usage_page('00000000-0000-4000-a000-000000000001', '2026-11-01T00:00:00Z', '2026-11-06T00:00:00Z', NULL, NULL, NULL, 1, 100)->'summary'->>'totalTokens')::NUMERIC),
  47::NUMERIC,
  'Usage API RPC total reconciles to direct organization rows'
);
SELECT extensions.is(
  (SELECT aggregate_usage_page('00000000-0000-4000-a000-000000000001', '2026-11-01T00:00:00Z', '2026-11-06T00:00:00Z', NULL, NULL, NULL, 1, 100)->'summary'->>'knownCost'),
  '4.50',
  'Usage API RPC known cost matches dashboard summary'
);
SELECT extensions.is(
  (SELECT aggregate_usage_page('00000000-0000-4000-a000-000000000001', '2026-11-01T00:00:00Z', '2026-11-06T00:00:00Z', 'all-unpriced', NULL, NULL, 1, 100)->'summary'->>'knownCost'),
  NULL::TEXT,
  'an all-unpriced period is unknown rather than a confirmed zero'
);
SELECT extensions.is(
  (SELECT known_cost FROM aggregate_cost_and_outcomes('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000015', 'missing_outcome', '2026-11-01T00:00:00Z', '2026-11-06T00:00:00Z')),
  NULL::TEXT,
  'outcome cost aggregate keeps an all-unpriced subtotal unknown'
);
SELECT extensions.is(
  (aggregate_dashboard_summary('00000000-0000-4000-a000-000000000001', '2026-11-01T00:00:00Z', '2026-11-06T00:00:00Z')->'summary'->>'unattributedKnownCost')::NUMERIC,
  0.50::NUMERIC,
  'unattributed priced cost is separated from workload cost'
);
SELECT extensions.is(
  (SELECT count(*)::BIGINT FROM aggregate_dashboard_trends_v2('00000000-0000-4000-a000-000000000001', '2026-11-01T00:00:00Z', '2026-11-06T00:00:00Z')),
  5::BIGINT,
  'trend includes UTC days with no usage or outcomes'
);
SELECT extensions.is(
  (SELECT sum(total_tokens::NUMERIC) FROM aggregate_dashboard_trends_v2('00000000-0000-4000-a000-000000000001', '2026-11-01T00:00:00Z', '2026-11-06T00:00:00Z')),
  47::NUMERIC,
  'daily trend tokens reconcile to dashboard summary'
);
SELECT extensions.is(
  (SELECT sum(outcome_count::NUMERIC) FROM aggregate_dashboard_trends_v2('00000000-0000-4000-a000-000000000001', '2026-11-01T00:00:00Z', '2026-11-06T00:00:00Z')),
  16::NUMERIC,
  'daily outcome counts reconcile across multiple types and workloads'
);
SELECT extensions.is(
  (SELECT outcome_type_count FROM aggregate_outcome_analytics('00000000-0000-4000-a000-000000000001', '2026-11-01T00:00:00Z', '2026-11-06T00:00:00Z') WHERE workload_id = '00000000-0000-4000-a000-000000000013' LIMIT 1),
  2::BIGINT,
  'outcome-only workload exposes both types for CPO scope validation'
);
SELECT extensions.is(
  (SELECT total_tokens FROM aggregate_audit_window_v2('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000011', '2026-11-01T00:00:00Z', '2026-11-06T00:00:00Z')),
  '21',
  'audit workload tokens reconcile to its input and output tokens'
);
SELECT extensions.is(
  (SELECT request_count FROM aggregate_audit_window_v2('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000011', '2026-11-01T00:00:00Z', '2026-11-06T00:00:00Z')),
  5::BIGINT,
  'audit request count reconciles within the workload scope'
);
SELECT extensions.is(
  (SELECT outcomes->>'lead_created' FROM aggregate_audit_window_v2('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000011', '2026-11-01T00:00:00Z', '2026-11-06T00:00:00Z')),
  '1',
  'audit outcome inputs preserve separate outcome types'
);
SELECT extensions.is(
  (SELECT known_cost FROM aggregate_audit_window_v2('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000011', '2026-11-01T00:00:00Z', '2026-11-06T00:00:00Z')),
  '1.25',
  'audit input retains known cost and independently tracks unpriced rows'
);
SELECT extensions.is(
  (SELECT known_cost FROM aggregate_audit_window_v2('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000015', '2026-11-01T00:00:00Z', '2026-11-06T00:00:00Z')),
  NULL::TEXT,
  'audit input retains unknown cost as null when every event is unpriced'
);

SELECT * FROM extensions.finish();
ROLLBACK;
