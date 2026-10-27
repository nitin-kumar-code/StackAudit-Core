# StackAudit

StackAudit is a self-hostable AI cost intelligence dashboard. It ingests provider usage records, applies effective-dated pricing, attributes usage to workloads, records business outcomes, and exposes cost, audit, and monitoring views.

This repository is an early preview. The current app includes OpenAI and Anthropic normalizers, CSV and API ingestion paths, a Supabase-backed pricing and usage pipeline, workload attribution, outcomes, audit rules, monitoring, alerts, and dashboard APIs. Authentication and organization setup are still early-stage; review [Security](SECURITY.md) before using it with sensitive or shared data.

## Local development

Requirements: Node.js 20+, npm, and the [Supabase CLI](https://supabase.com/docs/guides/cli).

```sh
npm ci
cp .env.example .env.local
supabase start
```

Set `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `.env.local` to the local values printed by `supabase status`. Apply migrations with `supabase db reset`, then seed the demo data and start the app:

```sh
npm run seed
npm run dev
```

The seed command uses `DEMO_ORG_ID` from `.env.local` for the development-only API fallback. The demo organization is identified by a dedicated `demo_seed_key` marker added by the migrations. If the fixed ID already belongs to an unmarked organization, seeding stops before cleanup. Cleanup touches only records inside that marked demo organization. Keep the service-role key out of client-side code.

### Reproducible demo data

`DEMO_SEED`, `DEMO_DATASET_DAYS`, and `DEMO_DATASET_END` define the scenario. The end is an exclusive UTC timestamp, so the demo covers `[end - days, end)`. Reusing the same values recreates the same logical event IDs, references, timestamps, request/token counts, and outcomes. Pricing is read from the database `pricing_catalog`; the seeder refuses to write if it cannot price the generated scenario. No provider API is called.

`npm run seed` and `npm run seed:demo` replace the dedicated demo dataset. `npm run seed:reset` is the same safe reset-and-seed operation. A failed write triggers cleanup of that marked demo dataset, so a partially seeded scenario is not left behind. The pricing catalog and all unmarked organizations are not changed.

Remote databases are refused by default. Avoid production entirely. If a remote, disposable demo database is deliberately required, set `DEMO_SEED_ALLOW_REMOTE=true` and set `DEMO_SEED_EXPECTED_REMOTE_HOST` to the exact hostname in `NEXT_PUBLIC_SUPABASE_URL`; the dedicated demo ownership marker is still required. Never set these values in a production environment.

For deterministic reproduction, keep the seed, day count, exclusive end timestamp, and pricing catalog unchanged. To have the existing monitoring engine evaluate the recent 14-day scenario, set the end timestamp to the current UTC midnight before running the seed.

## Commands

```sh
npm run typecheck
npm run lint
npm test                 # unit tests
npm run test:integration # requires a running local Supabase stack and local service-role key
npm run build
npm run seed
npm run seed:reset
```

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

No license is currently included. Until the project owner selects and adds a license, users should not assume they have permission to redistribute or modify this code. See the license decision noted in `AUDIT_REPORT.md`.
