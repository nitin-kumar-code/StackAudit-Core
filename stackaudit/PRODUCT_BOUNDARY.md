# StackAudit product boundary

## What the OSS product is

StackAudit OSS should be a self-hosted, evidence-oriented ledger and analysis app for AI usage: normalize imported/provider usage, price it with a dated catalog, attribute it to a workload, and show known costs and data gaps. Audits and alerts are explanations over these records, not invoice adjudication. Costs, data completeness, attribution scope, and assumptions must stay visible and freely usable.

**Primary user:** an engineer or technical founder at a small AI product team who can export provider usage and wants to answer “which product workload/model drove known spend, and what changed?” The agency scenario is a later hypothesis because current tenancy and client allocation are inadequate.

### What currently works from the repo

- Core library code can normalize OpenAI and Anthropic organization-level daily usage responses and parse a narrow canonical CSV shape.
- Effective-dated pricing lookup and decimal-based cost calculation are implemented.
- Usage persistence/ingestion logic records unknown-price state; workload rules, outcome events, audits, alert processing, and dashboard APIs have code and unit coverage.
- A Next.js dashboard, Supabase migrations, and deterministic demo dataset builder exist.

### What a clone cannot currently do reliably

The supported V0 boundary is one local operator: the application requires `STACKAUDIT_DATABASE_MODE=local` and an existing `STACKAUDIT_WORKSPACE_ORG_ID`, and API requests without a bearer token are scoped to that workspace. The server refuses remote database URLs in local mode. This is intentionally not a shared-user or hosted product; anyone who can reach the local app can act as its operator.

## OSS and hosted boundary

Keep the intelligence engine and self-hosted completeness real. Hosted can charge for someone reliably operating the same engine: ingestion continuity, secure credential handling, backups, managed upgrades, alert delivery, retention, and response/support. A paid tier must not withhold provider normalization, pricing math, attribution, audits, or basic alerts from the OSS install.

| Capability | OSS recommendation | Hosted recommendation | Current implementation |
|---|---|---|---|
| Provider integrations | Keep adapters and sync support open | Managed scheduled sync as convenience | CSV is the V0 import path; provider adapters are library primitives with no credential or sync workflow |
| CSV usage ingestion | Keep full import path open | Assisted imports only | Fully implemented for V0; in-app CSV upload UI and POST /api/v1/usage/import persist records with deduplication, pricing calculation, and workspace scoping |
| Pricing catalog | Keep schema, lookup, and community data open | Maintained catalog feed/updates can be convenience | Effective dates supported; no rows/curation pipeline in migrations |
| Deterministic cost calculation | Keep fully open | Same engine | Implemented with decimal arithmetic; verify end-to-end |
| Workload attribution | Keep core rules open | Managed mapping assistance | API-key rules exist; no rich mapping UI or client dimension |
| Outcome ingestion | Keep REST endpoint and event schema open | Managed SDKs/integrations as convenience | `POST /api/v1/outcomes` exists; no SDK; outcome semantics are minimal |
| Cost per outcome | Keep fully open with caveats | Same engine; hosted quality workflows may add value later | Scoped aggregates exist; workload cost is not partitioned across outcome types |
| Audits | Keep rules/evidence open | Hosted execution/history convenience | Rules/services exist; no invoice reconciliation |
| Monitoring | Keep scheduling hooks and basic engine open | Managed schedules and continuity | Cron endpoint exists; scheduling must be supplied externally |
| Basic alerts | Keep webhook path open | Reliable hosted delivery/retention | Webhook channel code; no Slack/email delivery |
| Dashboard | Keep complete local dashboard open | Managed availability | Next app exists; end-to-end auth/UI unverified |
| History/retention | Self-host owner controls it | Sell managed backup, retention, export and continuity | Database stores history; no retention/backup ops product |
| Scheduled execution | Open cron hook | Managed worker/scheduler | Internal secret-protected endpoint, no scheduler deployment |
| Slack/email delivery | Keep a basic adapter open if built | Managed routing/diagnostics convenience | Not present |
| Multi-organization/team | Open community/team capability where safely supported | Hosted org management convenience | Org field and setup route; membership/roles/RLS absent |
| Managed database | Self-host DB remains supported | Hosted infrastructure | Not present |
| Secret storage | Self-host secret manager integrations stay open | Managed encrypted storage/rotation convenience | Webhook encryption helper; provider credential store absent |
| Advanced analytics/forecasting | Defer | Consider paid after demand evidence | Forecasting absent |
| CI cost checks | Keep CLI/action core open | Hosted baselines/history convenience | Application CI is implemented in .github/workflows/ci.yml; PR spend-check CLI action is deferred |
| Public API | Keep core API open | Higher reliability/support may be paid | Partial REST routes; no OpenAPI |
| MCP integration | Defer until workflows and demand clear | Could be available to hosted accounts too | Not present |
| Enterprise auth/SSO | Open standards integrations where feasible | Managed configuration/support | Not present |
| Support | Community docs/issues open | Paid response/support/implementation | No support offer or SLA |

“Potential hosted convenience” is not proof people will pay. Paid enhancements should be based on requests and explicit commitments, not inferred from architecture.

## Actual usage journeys

### Individual developer

1. Discover via GitHub README/demo. Current README positions a self-hostable app with SVG dashboard preview and verifiable setup sequence.
2. Clone `stackaudit/`, install Node/npm dependencies, create `.env.local`, start Supabase, reset migrations.
3. Manually load pricing records because a fresh migration leaves catalog empty; then `npm run seed`, `npm run dev`.
4. For demo browsing, the local server requires `STACKAUDIT_WORKSPACE_ORG_ID` and verifies that organization exists. It never selects an organization implicitly. Do not expose this server.
5. To use real data today, CSV upload is supported directly in the dashboard UI (`/usage`) and via `POST /api/v1/usage/import` with file validation, unpriced row detection, and idempotency. Direct provider API credential synchronization remains a library primitive.
6. Create workloads and API-key rules using app/API; manually send outcomes with `POST /api/v1/outcomes`. The current event means a caller-reported type/count/time, not verified successful or high-quality output.
7. Inspect available cost/audit views, interpreting CPO only for a complete matched workload/time/outcome scope. A plain usage list page reads the API, which itself requires local fallback or bearer auth.

**Value today:** inspect seeded data only after manual pricing setup, or reuse core primitives with engineering effort. It is not yet a zero-friction personal cost tracker.

### AI startup engineering team

1. Deploy privately with Supabase and Next.js. Current app is not safe for shared/production use because of service-role access, no RLS, incomplete identity/membership, and development fallback.
2. In a future supported path, configure read-only organization usage credentials or import provider exports. Today, CSV import persists records into the database with deduplication and unpriced state tracking; direct provider API syncing is not yet wired to a UI flow.
3. Define workloads and route usage identifiers/API keys to them. Attribution is API-key rule based; ambiguous/unmatched usage can remain unallocated.
4. Emit outcomes using an idempotency key, type, count, time, and metadata. Teams need to define event meaning and separately ensure retries, reopened work, quality and human work are accounted for; current schema cannot represent them explicitly.
5. Compare workload cost/outcome aggregates; use audits for changes in the same evidence windows. A full workload cost divided by each outcome type is not a partition if several types exist.
6. Configure monitoring, then supply a trusted scheduler to call the CRON_SECRET endpoint. Current delivery has webhook code only, and no deployment, secret rotation, scheduler, or notification reliability is bundled.

### AI agency

Per-client workload naming and per-workload attribution could be approximated within a single organization, but this is not a supported multi-client product. There is no agency/client entity, RBAC, RLS, safe member boundaries, per-client export/report, or evidence of tenant isolation. Agency customer environments must not share an installation until isolation is engineered and tested. A future safe design should model client/project explicitly and test allocation/reconciliation; it should not use organization-name conventions as a security boundary.

## Practical current setup (and failure points)

From `stackaudit/`, the documented commands are:

```sh
npm ci
cp .env.example .env.local
supabase start
# Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from `supabase status`.
supabase db reset
npm run seed
npm run dev
```

This path now seeds the reviewed pricing catalog before the demo data and requires the explicit workspace ID from `.env.local`. The demo remains a one-user local preview; no shared login or production identity system is provided. Integration behavior still requires a real local Supabase run.

## Smallest useful first-run experience

Make a local-only experience that starts from clean checkout and reaches a real dashboard without provider credentials:

1. `docker compose up` (or documented Supabase CLI path), with locked, versioned sample pricing fixtures.
2. One explicit demo seed command that works from empty schema, reports records and known/unpriced totals, and is safe/idempotent.
3. `npm run dev` opens the demo dashboard with the explicitly configured workspace, never an implicit organization selection.
4. A second path imports a documented canonical CSV through the UI or `POST /api/v1/usage/import`, previews parse/pricing/attribution failures, then commits idempotently.
5. A minimal workload/outcome example shows how to send an event and says what is and is not measured.

First meaningful real-data result must not be promised in a time band yet. The integration currently requires custom work; time-to-first-value needs observed user tests after import/sync is implemented.

## Recommended initial positioning

Test a narrow claim: **“Reconcile AI provider usage to known, effective-dated costs by product workload, with visible gaps when usage is unpriced or unattributed.”** This is concrete and supported more closely than “cost per successful outcome” or “AI spend intelligence” broadly. Do not claim business value/quality measurement until outcome and quality semantics improve and teams demonstrate they can instrument them.
