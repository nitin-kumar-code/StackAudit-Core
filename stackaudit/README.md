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

Set `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `.env.local` to the local values printed by `supabase status`. Apply migrations with `supabase db reset`, then start the app:

```sh
npm run dev
```

The development-only API fallback uses `DEMO_ORG_ID`. The seed command creates the fixed demo organization and prints its ID; copy that ID into `.env.local` and restart the app. The seed command refuses remote Supabase URLs unless `DEMO_SEED_ALLOW_REMOTE=true` is set explicitly. Do not use the service-role key in client-side code.

## Commands

```sh
npm run typecheck
npm run lint
npm test                 # unit tests
npm run test:integration # requires a running local Supabase stack and local service-role key
npm run build
npm run seed
```

## Architecture

- `core/providers` normalizes provider-specific usage into canonical events.
- `core/pricing` resolves effective-dated prices and calculates costs with decimal arithmetic.
- `core/usage` validates ingestion and reprices records when pricing becomes available.
- `core/workloads` owns workload and attribution-rule operations.
- `core/outcomes`, `core/audit`, and `core/monitoring` provide outcome analytics and evidence-based findings/alerts.
- `app/api/v1` exposes the HTTP boundary; `app/app` contains dashboard pages.
- `supabase/migrations` is the database schema history.

See subsystem READMEs under `core/` for contracts and behavior. The current deployment still has important limitations: dashboard aggregations are partly implemented in route handlers, the demo generator does not yet use the complete ingestion/pricing pipeline, and integration checks need local Supabase. See `AUDIT_REPORT.md` for the repository audit and known gaps.

## Data and privacy

Use only data you are authorized to process. Do not expose the Supabase service-role key. The current service-role-backed API and development organization fallback are intended for local development and are not a hardened multi-tenant deployment. RLS and production identity/authorization policies are not complete.

## License

No license is currently included. Until the project owner selects and adds a license, users should not assume they have permission to redistribute or modify this code. See the license decision noted in `AUDIT_REPORT.md`.
