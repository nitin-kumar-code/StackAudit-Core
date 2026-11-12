# Configuration Guide

StackAudit uses environment variables to configure its database connections, workspace scope, security boundaries, and seed parameters.

All environment settings are loaded from `.env.local` in development.

---

## Environment Variables Reference

| Variable | Type | Default | Description | Required |
| :--- | :--- | :--- | :--- | :--- |
| `STACKAUDIT_DATABASE_MODE` | `string` | `local` | Database security mode. Accepts `local` or `remote`. | **Yes** |
| `NEXT_PUBLIC_SUPABASE_URL` | `string` | `http://127.0.0.1:54321` | Base URL of the Supabase API endpoint. | **Yes** |
| `SUPABASE_SERVICE_ROLE_KEY` | `string` | *(none)* | Service-role API key obtained from `npx supabase status`. | **Yes** |
| `STACKAUDIT_WORKSPACE_ORG_ID`| `UUID` | `8a775c7f-e31c-8f9b-9000-000000000001` | The active organization UUID for all workspace operations. | **Yes** |
| `DEMO_SEED` | `number` | `12345` | PRNG seed used for deterministic synthetic data generation. | No |
| `DEMO_DATASET_DAYS` | `number` | `90` | Number of days of historical usage events to generate. | No |
| `DEMO_DATASET_END` | `ISO Date` | Current UTC midnight | Exclusive end timestamp for the seeded historical interval. | No |
| `CRON_SECRET` | `string` | *(optional)* | Shared secret for securing internal maintenance endpoints. | No |

---

## Detailed Variable Specifications

### 1. `STACKAUDIT_DATABASE_MODE`
Controls the allowed database hostnames:
- `local`: Enforces that `NEXT_PUBLIC_SUPABASE_URL` points strictly to `localhost`, `127.0.0.1`, or `::1`. Any attempt to connect to an external host is blocked on startup.
- `remote`: Explicit operator override allowing external Supabase projects. *Note: Remote mode does not imply multi-tenant safety.*

### 2. `SUPABASE_SERVICE_ROLE_KEY`
- Used exclusively by server-side Next.js route handlers and CLI scripts (`scripts/setup.ts`, `scripts/seed-demo-data.ts`).
- It bypasses PostgreSQL Row Level Security (RLS) to perform aggregations and maintenance.
- **Security Rule**: Never prefix this variable with `NEXT_PUBLIC_`. It must never be bundled into client-side JavaScript.

### 3. `STACKAUDIT_WORKSPACE_ORG_ID`
- StackAudit scopes all data ingestion, attribution rules, outcome tracking, audit findings, and alerts to this single organization UUID.
- The server validates that this UUID exists in the `organizations` table on startup. If missing or invalid, API routes fail closed with a `400 / 404` error rather than leaking or guessing records.
- The pre-configured demo ID is `8a775c7f-e31c-8f9b-9000-000000000001`.

### 4. `DEMO_DATASET_END`
- When left empty or commented out, the demo seeder terminates generated events at the **current UTC day's midnight**. This guarantees that all dashboard time filters (Last 24h, Last 7d, Last 30d, Last 90d) display active traffic and live monitoring alerts.
- When set to an explicit ISO timestamp (e.g., `2024-10-17T00:00:00.000Z`), the seeder replays that exact historical timeframe deterministically.

---

## Usage Ingestion Configuration

In V0, usage is ingested via:
1. **The Web UI**: Navigate to `/app/usage` and upload a canonical CSV file.
2. **REST API**: Call `POST /api/v1/usage/import` with a multipart form containing your CSV file.

### Canonical CSV Headers

| Column | Required | Type | Description |
| :--- | :--- | :--- | :--- |
| `provider` | **Yes** | `string` | Provider identifier (`openai`, `anthropic`). |
| `model` | **Yes** | `string` | Model name (e.g., `gpt-4o`, `claude-3-5-sonnet-20241022`). |
| `timestamp` | **Yes** | `ISO string` | UTC event timestamp. |
| `input_tokens` | **Yes** | `integer` | Total input / prompt tokens (includes cached tokens). |
| `output_tokens` | **Yes** | `integer` | Generated completion tokens. |
| `provider_reference`| **Yes** | `string` | Unique provider request or event ID (used for deduplication). |
| `cache_read_tokens` | No | `integer` | Number of input tokens read from prompt cache. |
| `cache_creation_tokens` | No | `integer` | Number of tokens written to prompt cache. |
| `request_count` | No | `integer` | Aggregated requests count (defaults to `1`). |
| `api_key_id` | No | `string` | API Key or identifier used for workload attribution matching. |
