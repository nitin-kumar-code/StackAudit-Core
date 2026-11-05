# Analytics metric contract

StackAudit V0 analytics use a single workspace selected by the local server configuration. Database filters use half-open time windows: `timestamp >= start AND timestamp < end`. Daily buckets use UTC calendar boundaries, including partial first/last days while retaining the requested filter bounds. Audit requests are snapped to UTC day boundaries and their end is clamped to the configured ingestion watermark before the resulting `[start, end)` windows are queried. Monetary values remain decimal strings in database/API contracts.

| Metric | Definition | Source and scope |
| --- | --- | --- |
| Request count | Sum of each usage event's `request_count`; legacy nulls count as one. | Usage RPC, dashboard summary/trend, audit RPC. |
| Input tokens | Sum of `input_tokens`. | Usage events. |
| Output tokens | Sum of `output_tokens`. | Usage events. |
| Cached input tokens | A breakdown of input; never added again to total tokens. | Cache read/creation columns. |
| Total tokens | Input plus output only. | Shared TypeScript helper and SQL aggregates. |
| Known priced cost | Sum of `calculated_cost` only where `is_unpriced = false`; null when all events are unpriced, otherwise the priced subtotal. | Usage, dashboard, workload, outcome, and audit aggregates. |
| Complete cost | Known priced cost only when the scope has no unpriced events. The authoritative total is null for partial pricing. An empty scope is a complete zero because no unknown-priced event exists. | Same usage scope and time window. |
| Unpriced usage | Count of usage events with `is_unpriced = true`; stored zero placeholders are excluded from cost sums. | Usage, dashboard, audit, and outcome aggregates. |
| Attributed cost | Cost for events matched to a workload by the organization/provider/API-key attribution rule. | Dashboard workload rows; only complete when all matching events are priced. |
| Unattributed cost | Cost for events with no workload match. Kept separate from workload totals. | Dashboard `unattributed` bucket. |
| Outcome count | Sum of `outcome_events.count` in the selected organization, workload, type, and time scope. | Outcomes and dashboard trend/summary. |
| Cost per outcome | Complete workload cost divided by its outcome count, only when exactly one outcome type exists for that workload and selected period/day. Null for zero outcomes, partial pricing, or multiple outcome types. | Outcome analytics; no organization-wide CPO and no implied allocation among types. |
| Audit finding count | Number of findings produced/persisted for the evaluated workload and window; Dashboard's open finding preview is capped at three, Audit GET returns at most 50 recent records. | Audit service and API. |
| Alert count | Dashboard `activeAlerts` is the exact number of `OPEN` alerts in the configured workspace, independent of the dashboard usage time window. Monitoring-run `alerts_count` counts active findings processed in that run, not distinct historical alert records. | Dashboard and monitoring run. |

## Reconciliation paths

`aggregate_usage_page` is the Usage API source. `aggregate_dashboard_summary` produces organization, workload, and unattributed buckets. `aggregate_dashboard_trends_v2` produces UTC daily totals; the legacy trend RPC projects the same values. `aggregate_outcome_analytics`, `aggregate_cost_and_outcomes`, and `aggregate_daily_cost_and_outcomes` share the workload/window cost scope. `aggregate_audit_window_v2` supplies known cost, tokens, requests, model breakdowns, and outcome inputs to audits and monitoring. The application uses `core/usage/metrics.ts` for request/token semantics and final CPO eligibility.

The real-record SQL fixture is `supabase/tests/analytics_reconciliation.test.sql`; run it with `npx supabase test db` after starting the local Supabase stack and applying migrations. The broader service-role integration fixture is `app/api/v1/usage/integration.test.ts` and runs through `npm run test:integration` with local Supabase credentials.
