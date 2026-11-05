# Database inventory and assumptions

This document describes the schema produced by the ordered files in `supabase/migrations/` (17 SQL migrations). The migration history is the only supported source for fresh installations and upgrades. See [Supabase setup notes](../supabase/README.md) and [self-hosting](SELF_HOSTING.md).

## Tables and relationships

| Table | Current columns / purpose | Keys and relationships |
|---|---|---|
| `organizations` | `id`, `name`, `created_at`, `demo_seed_key` | UUID primary key; `demo_seed_key` has a unique partial index when non-null. This preview normally has one configured organization. |
| `workloads` | `id`, `organization_id`, `name`, nullable `description`, `created_at` | Organization FK cascades on delete. |
| `attribution_rules` | `id`, `organization_id`, `workload_id`, `provider`, `match_type`, `match_value`, `created_at` | Organization and workload FKs cascade. Unique `(organization_id, provider, match_type, match_value)`. Initial `rule_type/rule_value` were renamed in migration history. |
| `pricing_catalog` | `id`, provider/model, input/output/cache prices, `effective_from`, nullable `effective_until`, source, `created_at` | Unique `(provider, model, effective_from)`. No organization key; catalog is shared by the local installation. |
| `usage_events` | `id`, `organization_id`, provider/model, timestamp, input/output/cache token counts, `provider_reference`, nullable `api_key_id`, `calculated_cost`, `is_unpriced`, `request_count`, `raw_response_hash`, `captured_at`, `updated_at`, `reprice_attempts` | Organization FK cascades. Unique `(organization_id, provider, provider_reference)`. Workload is derived at query time through `v_attributed_usage_events`; there is no stored workload FK in the current schema. |
| `outcome_events` | `id`, nullable `workload_id`, `outcome_type`, timestamp, count, metadata JSONB, `created_at`, nullable `organization_id`, nullable `idempotency_key` | Organization FK cascades; workload FK sets null on delete. Unique `(organization_id, idempotency_key)`; PostgreSQL permits multiple null keys. The API always supplies an organization, but the migration does not make this column `NOT NULL`. |
| `audit_findings` | `id`, nullable `workload_id`, category, severity, title, description, confidence, evidence JSONB, time-window bounds, `detected_at`, `created_at`, status, `organization_id` | Organization FK cascades; workload FK sets null. Unique expression index on organization, `COALESCE(workload_id, zero UUID)`, category, start, end. Status check: `OPEN`, `DISMISSED`, `RESOLVED`. |
| `monitoring_configs` | `id`, `organization_id`, nullable `workload_id`, enabled, config JSONB, created/updated timestamps | Organization and workload FKs cascade. Unique `(organization_id, workload_id)` (multiple null workload IDs are still allowed by PostgreSQL uniqueness semantics). |
| `monitoring_runs` | `id`, organization, started/completed times, status, evaluated-workload/finding/alert counts, error text | Organization FK cascades. Status check: `RUNNING`, `COMPLETED`, `COMPLETED_WITH_ERRORS`, `FAILED`, `TIMED_OUT`. |
| `alerts` | `id`, organization, nullable workload/finding IDs, category, severity, status, fingerprint, `notified_at`, `last_notified_severity`, `notification_attempts`, `last_notification_error`, created/updated timestamps | Organization FK cascades; workload FK cascades; finding FK sets null. Fingerprint is globally unique. Status and severity checks apply. |
| `provider_sync_state` | `organization_id`, provider, `last_successful_sync_at`, legacy `latest_bucket_end`, `last_ingested_bucket_end`; primary key `(organization_id, provider)` | Organization FK cascades. The alignment migration backfills the canonical watermark from `latest_bucket_end` when that legacy column exists. |

The application model has no explicit database table for `CanonicalUsageEvent` or `PricingRecord`; they map to `usage_events` and `pricing_catalog`. The `v_attributed_usage_events` view adds the derived `workload_id` to usage rows by joining API-key rules. It is created with `security_invoker=true`.

## Constraints and indexes

Important unique constraints/indexes:

- Primary keys on all tables.
- `pricing_catalog(provider, model, effective_from)`.
- `usage_events(organization_id, provider, provider_reference)`.
- `attribution_rules(organization_id, provider, match_type, match_value)`.
- `outcome_events(organization_id, idempotency_key)`.
- `monitoring_configs(organization_id, workload_id)` and `alerts(fingerprint)`.
- `organizations(demo_seed_key)` where the marker is non-null.
- Audit finding unique expression index described in the table above.

Query indexes include `idx_usage_events_timestamp(timestamp)`, `idx_usage_events_attribution(organization_id,provider,api_key_id)`, `idx_usage_events_org_key_time(organization_id,api_key_id,timestamp)`, `idx_usage_events_org_time_id(organization_id,timestamp DESC,id DESC)`, `idx_usage_events_org_provider_time_id(organization_id,provider,timestamp DESC,id DESC)`, and `idx_usage_events_org_model_time_id(organization_id,model,timestamp DESC,id DESC)`; `idx_attribution_rules_match(organization_id,provider,match_type,match_value)` and `idx_attribution_rules_org_workload(organization_id,workload_id,provider,match_type,match_value)`; `idx_outcome_events_workload_type_time(workload_id,outcome_type,timestamp)`, `idx_outcome_events_org_time_workload(organization_id,timestamp,workload_id)`, and `idx_outcome_events_workload_time(workload_id,timestamp)`; and `idx_alerts_org_status(organization_id,status)`.

The database does **not** currently enforce many application-level assumptions: non-negative token counts and rates; cache token counts not exceeding input; `request_count` or outcome `count` being positive; effective price intervals not overlapping; attribution `match_type` being `api_key`; the organization on a workload-linked outcome/config/alert matching the workload's organization; and monitoring config JSON shape/range. API/core services validate some of these but direct service-role SQL writes can bypass those checks. Several provider/model/type columns are unconstrained text.

## RLS, privileges, functions, and triggers

Migration `20261031000000_single_user_local_preview_boundary.sql` enables RLS on every `public` table existing at that migration, revokes table/sequence access from `PUBLIC`, `anon`, and `authenticated`, and revokes public function execution before granting the necessary RPC execution to `service_role`. It creates **no permissive policies**. The application server uses a service-role client that bypasses RLS and scopes access in route code to `STACKAUDIT_WORKSPACE_ORG_ID`; this is a local single-user trust boundary, not tenant isolation. The browser does not access tables/RPCs directly. Default privileges revoke browser-role access for future objects, but the default-privilege statements do not automatically enable RLS on a future table; new tables must add and verify RLS explicitly.

All functions inspected in migration history are `SECURITY INVOKER`; no `SECURITY DEFINER` function is present. Newer aggregation RPCs pin `search_path=public`; several older utility/compatibility functions do not pin it. Public/anon/authenticated execution is revoked by the access-boundary migration; current application RPCs are granted to `service_role` in the migrations that define them.

Current application RPC paths:

| Function | Purpose / consumer |
|---|---|
| `aggregate_usage_page(UUID,TIMESTAMPTZ,TIMESTAMPTZ,TEXT,TEXT,UUID,INTEGER,INTEGER) RETURNS JSONB` | Bounded usage events, full-filter summary, filter options, pagination metadata. |
| `aggregate_dashboard_summary(UUID,TIMESTAMPTZ,TIMESTAMPTZ) RETURNS JSONB` | Dashboard totals, workload totals, attributed/unattributed buckets. |
| `aggregate_dashboard_trends_v2(UUID,TIMESTAMPTZ,TIMESTAMPTZ) RETURNS TABLE(period_start,known_cost,total_cost,is_cost_complete,priced_events,unpriced_events,total_tokens,request_count,outcome_count)` | UTC daily dashboard series, including empty days. |
| `aggregate_outcome_analytics(UUID,TIMESTAMPTZ,TIMESTAMPTZ) RETURNS TABLE(workload_id,workload_name,outcome_type,total_outcomes,known_cost,total_cost,is_cost_complete,priced_events,unpriced_events,outcome_type_count)` | Workload/outcome-type cost and outcome aggregates. |
| `aggregate_cost_and_outcomes(UUID,UUID,TEXT,TIMESTAMPTZ,TIMESTAMPTZ) RETURNS TABLE(known_cost,total_cost,total_outcomes,unpriced_events,priced_events,outcome_type_count)` | Workload CPO scope and completeness counts. |
| `aggregate_daily_cost_and_outcomes(UUID,UUID,TEXT,TIMESTAMPTZ,TIMESTAMPTZ) RETURNS TABLE(period_start,known_cost,total_cost,total_outcomes,unpriced_events,priced_events,outcome_type_count)` | Daily UTC CPO series. |
| `aggregate_audit_window_v2(UUID,UUID,TIMESTAMPTZ,TIMESTAMPTZ) RETURNS TABLE(known_cost,total_tokens,request_count,unpriced_events,models,outcomes)` | Audit input totals/models/outcome map. |
| `upsert_audit_findings(JSONB) RETURNS void` | Idempotent audit finding persistence. |
| `upsert_alert(UUID,UUID,UUID,TEXT,TEXT,TEXT) RETURNS TABLE(alert_id,was_created,was_reopened,was_escalated,previous_severity,current_status)` | Atomic alert create/update/reopen/escalation. |

Compatibility/older functions retained in migrations include `aggregate_dashboard_metrics`, `aggregate_dashboard_trends` (legacy return shape), and `aggregate_audit_metrics`. Utility functions include `sev_rank` and trigger function `update_modified_column`. The current API uses the `*_v2` or newer bounded RPCs above. Aggregation intervals are `[start,end)` and monetary values are returned as text where precision matters.

Triggers call `update_modified_column()` before updates to `monitoring_configs`, `alerts`, and `usage_events`, refreshing `updated_at`.

The required schema extension is `uuid-ossp` for UUID defaults. The pgTAP fixture creates the `pgtap` extension in `extensions` for the test transaction; it is test support, not an application seed requirement.

## Seed and migration dependencies

There is no committed Supabase `seed.sql`. A clean `supabase db reset` creates schema only. `pricing_catalog` starts empty; `npm run pricing:load` loads versioned reference entries from `fixtures/pricing/reference-pricing-v1.json`. `npm run seed` also loads those fixtures if the catalog is empty, creates the fixed demo organization if missing, and replaces only the organization marked `demo_seed_key=stackaudit-demo-v1`. The configured workspace must exist before the app can serve normal routes.

The 17 migration files are ordered by timestamp under `supabase/migrations/`; later migrations depend on earlier tables and replace earlier RPC versions. Fresh databases replay all of them. Upgrades add forward migrations; do not edit deployed history to retrofit changes.

`full_setup.sql` is retained as a historical all-in-one snapshot, not an install path. It duplicates an earlier schema, has diverged from later migration definitions, and currently contains a second divergent `provider_sync_state` definition. No current setup script or workflow applies it. Do not run it together with migrations. Repository references are in documentation/release-audit notes only.

## Migration alignment

`20261106000000_align_service_columns.sql` adds `last_ingested_bucket_end` and backfills it from `latest_bucket_end` on installations that have the legacy column. It also adds `notification_attempts` (default `0`, not null) and nullable `last_notification_error` to `alerts`, which are used for notification retry/error bookkeeping. The migration is forward-only; it retains the legacy watermark column for compatibility.

Other limitations include no database-enforced organization/workload composite foreign keys, no built-in backup/restore workflow, and no account/tenant authorization model.

The current alert API returns `SELECT *`, so the new retry fields are included in its database-shaped response. The Alerts UI still expects a `first_triggered_at` field, while the current API/schema provide `created_at`; that display mismatch is not addressed by the schema alignment migration. The “Run Monitoring” button calls the local operator route `POST /api/v1/monitoring/run`.
