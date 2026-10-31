# StackAudit

StackAudit is a self-hostable AI cost intelligence dashboard. It ingests provider usage records, applies effective-dated pricing, attributes usage to workloads, records business outcomes, and exposes cost, audit, and monitoring views.

This repository is an early preview. The current app includes OpenAI and Anthropic normalizers, CSV and API ingestion paths, a Supabase-backed pricing and usage pipeline, workload attribution, outcomes, audit rules, monitoring, alerts, and dashboard APIs. Authentication and organization setup are still early-stage; review [Security](SECURITY.md) before using it with sensitive or shared data.

## First-Run Quickstart

Follow this sequence to set up a clean local installation from scratch.

### Prerequisites

- **Node.js**: version 20+ and **npm**
- **Docker**: Docker Desktop (or running Docker daemon)
- **Supabase CLI**: installed globally (`npm install -g supabase` or `brew install supabase/tap/supabase`)

> [!NOTE]
> All commands should be run from inside the `stackaudit/` directory.

### 1. Install dependencies

```sh
cd stackaudit
npm ci
```

### 2. Configure environment

Copy the sample environment file:

```sh
cp .env.example .env.local
```

### 3. Start local Supabase

```sh
supabase start
```

Retrieve the local credentials by running `supabase status`. Update `.env.local`:

```ini
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key from supabase status>
SUPABASE_SERVICE_ROLE_KEY=<service_role key from supabase status>
DEMO_ORG_ID=8a775c7f-e31c-8f9b-9000-000000000001
```

### 4. Apply migrations

Initialize the database schema from the 14 migrations in `supabase/migrations/`:

```sh
supabase db reset
```

*(Alternatively, if `DATABASE_URL` is set, you can run `npm run db:migrate`).*

### 5. Load reviewed pricing fixtures

Populate the `pricing_catalog` with reviewed reference prices for OpenAI and Anthropic models:

```sh
npm run pricing:load
```

This loads versioned reference pricing (`fixtures/pricing/reference-pricing-v1.json`) covering input, output, and cached token rates with effective dating. Loading is idempotent and will never overwrite manually maintained production pricing.

### 6. Seed demo dataset

Seed 90 days of deterministic usage, workloads, attribution rules, and outcomes:

```sh
npm run seed
```

*(Note: `npm run seed` will also automatically load pricing fixtures if the catalog is empty).*

The seeder runs the application's actual audit and monitoring engine on the seeded data, creating findings and alerts.

#### All-in-one shortcut

After starting Supabase and applying migrations, you can run steps 5 and 6 together:

```sh
npm run setup
```

### 7. Start the application

```sh
npm run dev
```

### 8. Open the dashboard

Visit [http://localhost:3000](http://localhost:3000) in your browser. The dashboard will display live spend KPIs, workload allocations, cost trends, cost-per-outcome metrics, and active monitoring alerts.

---

### Reproducible demo data

`DEMO_SEED`, `DEMO_DATASET_DAYS`, and `DEMO_DATASET_END` define the scenario:
- `DEMO_SEED` (default `12345`): seed for the pseudo-random generation.
- `DEMO_DATASET_DAYS` (default `90`): number of days of history to generate.
- `DEMO_DATASET_END` (optional): exclusive UTC timestamp for the end of the range. If left unset, it defaults to the current day's UTC midnight so the recent 14-day monitoring window and dashboard filters (Last 24h, Last 7d, Last 30d, Last 90d) immediately display recent traffic and active alerts. To replay a fixed historical scenario deterministically, specify an ISO timestamp (e.g. `2026-10-17T00:00:00.000Z`).

`npm run seed` and `npm run seed:demo` replace the dedicated demo dataset. `npm run seed:reset` is the same safe reset-and-seed operation. Cleanup affects only the organization marked with `demo_seed_key: stackaudit-demo-v1`. Non-demo organizations and manual pricing records are untouched.

Remote databases are refused by default. If a remote, disposable database is deliberately required, set `DEMO_SEED_ALLOW_REMOTE=true` and set `DEMO_SEED_EXPECTED_REMOTE_HOST` to the exact hostname in `NEXT_PUBLIC_SUPABASE_URL`.

---

## Troubleshooting

- **`The pricing catalog has no OpenAI or Anthropic records`**:
  Run `npm run pricing:load` to populate the reference pricing catalog from fixtures.
- **`relation "organizations" does not exist`**:
  Migrations have not been applied. Run `supabase db reset` to apply the migrations.
- **`Missing Authorization header` or empty dashboard**:
  Ensure `DEMO_ORG_ID` in `.env.local` is set to `8a775c7f-e31c-8f9b-9000-000000000001` (matching the seeded demo organization ID).
- **`Docker API connect error`**:
  Ensure Docker Desktop is open and the Docker daemon is running before executing `supabase start`.
- **`Last 7 Days shows $0.00 on dashboard`**:
  If `DEMO_DATASET_END` is set in `.env.local` to a date in the past, usage events will not fall within the last 7 days. Comment out `DEMO_DATASET_END` in `.env.local` and re-run `npm run seed` to end the dataset at today's UTC midnight.
- **`Refusing cleanup: organization ... is not marked as the StackAudit demo dataset`**:
  The demo seeder refuses to delete data from an organization unless it has the explicit `demo_seed_key: stackaudit-demo-v1` marker. Use a clean database or ensure you are using the configured demo organization ID.

---

## Commands

```sh
npm run typecheck         # Typecheck TypeScript files
npm run lint              # Run ESLint checks
npm test                  # Unit tests (excludes Supabase integration tests)
npm run test:integration  # Database integration tests (requires local Supabase stack)
npm run build             # Build production Next.js bundle
npm run pricing:load      # Load reviewed reference pricing fixtures
npm run seed              # Seed demo dataset (workloads, usage, outcomes, alerts)
npm run seed:reset        # Reset and re-seed demo dataset
npm run setup             # Full setup: verify schema, load pricing fixtures, seed demo
npm run db:migrate        # Inspect and run database migrations
npm run dev               # Start Next.js development server
```

## Analytics query contracts

The Usage API uses the half-open time interval `[start, end)`. It defaults to 50 events per page, accepts at most 100, orders newest first by timestamp and event ID, and accepts ranges up to 366 days. Provider, model, and workload filters are applied before pagination. The response summary and filter options cover the entire filtered range, including when the requested page has no events.

The database aggregation contracts are defined in `supabase/migrations/20261028000000_query_scalability.sql`:

- `aggregate_usage_page` returns a JSON object containing one bounded event page, whole-filtered-range totals, filter options, and pagination metadata. Monetary totals are decimal strings; `totalCost` is null when any matching usage is unpriced.
- `aggregate_dashboard_summary` returns organization totals, workload totals, and unattributed totals from the same usage scan.
- `aggregate_dashboard_trends_v2` returns one UTC-day row per day in the requested interval, with cost completeness, token/request totals, and outcomes scoped to the organization’s workloads. The original three-column `aggregate_dashboard_trends` contract remains available as a wrapper.
- `aggregate_audit_window_v2` returns workload-scoped usage and outcome aggregates for one audit window.
- `aggregate_outcome_analytics` returns workload/outcome-type groups with cost totals scoped to each workload.

These functions are called by the server with the service-role client and use `[start, end)` bounds. The Usage API enforces page size and range bounds before calling the database; `aggregate_usage_page` also enforces the page-size ceiling.

The same forward migration adds indexes for organization/time pagination, provider/model-filtered usage reads, reverse workload attribution lookups, and organization/workload outcome windows. Existing outcome-type/time and attribution-rule uniqueness indexes remain in use for their matching query paths.

## Architecture

- `core/providers` normalizes provider-specific usage into canonical events.
- `core/pricing` resolves effective-dated prices and calculates costs with decimal arithmetic.
- `core/usage` validates ingestion and reprices records when pricing becomes available.
- `core/workloads` owns workload and attribution-rule operations.
- `core/outcomes`, `core/audit`, and `core/monitoring` provide outcome analytics and evidence-based findings/alerts.
- `app/api/v1` exposes the HTTP boundary; `app/app` contains dashboard pages.
- `supabase/migrations` is the database schema history.

See subsystem READMEs under `core/` for contracts and behavior. Integration checks require local Supabase. See `AUDIT_REPORT.md` for the repository audit and known gaps.

## Data and privacy

Use only data you are authorized to process. Do not expose the Supabase service-role key. The current service-role-backed API and development organization fallback are intended for local development and are not a hardened multi-tenant deployment. RLS and production identity/authorization policies are not complete.

## License

StackAudit is licensed under the Apache License, Version 2.0. See the root [`LICENSE`](LICENSE) file for the complete license text. The license applies to contributions incorporated into StackAudit as described in Section 5 of that license. Third-party components and assets may be subject to their own terms; see their applicable notices and documentation.
