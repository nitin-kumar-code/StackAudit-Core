# Configuration Guide

StackAudit uses environment variables to configure its database connections, workspace scope, deployment security boundaries, and seed parameters.

All environment settings are loaded from `.env.local` in development.

---

## Environment Variables Reference

| Variable | Type | Default | Description | Required |
| :--- | :--- | :--- | :--- | :--- |
| `STACKAUDIT_DEPLOYMENT_MODE` | `string` | `local` | Enforces the V0 deployment boundary. Accepts `local` or `private-network`. Unsupported modes (`public`, `saas`) fail closed. | **Yes** |
| `STACKAUDIT_ALLOW_PRIVATE_NETWORK` | `boolean` | `false` | Required operator opt-in when running in `private-network` mode. | Only for private-network |
| `STACKAUDIT_WORKSPACE_ORG_ID`| `UUID` | `8a775c7f-e31c-8f9b-9000-000000000001` | The active organization UUID for all workspace operations. | **Yes** |
| `STACKAUDIT_ORG_ID` | `UUID` | *(none)* | Canonical alias for `STACKAUDIT_WORKSPACE_ORG_ID`. If both are provided, they must match. | No |
| `STACKAUDIT_DATABASE_MODE` | `string` | `local` | Database target validation. `local` requires a localhost URL; `remote` allows external endpoints. | **Yes** |
| `NEXT_PUBLIC_SUPABASE_URL` | `string` | `http://127.0.0.1:54321` | Base URL of the Supabase API endpoint. | **Yes** |
| `SUPABASE_SERVICE_ROLE_KEY` | `string` | *(none)* | Server-only service-role API key obtained from `npx supabase status`. | **Yes** |
| `DEMO_SEED` | `number` | `12345` | PRNG seed used for deterministic synthetic data generation. | No |
| `DEMO_DATASET_DAYS` | `number` | `90` | Number of days of historical usage events to generate. | No |
| `DEMO_DATASET_END` | `ISO Date` | Current UTC midnight | Exclusive end timestamp for the seeded historical interval. | No |
| `CRON_SECRET` | `string` | *(optional)* | Shared secret for securing internal maintenance endpoints (`/api/v1/internal/*`). Strictly scoped to configured workspace. | No |
| `WEBHOOK_ENCRYPTION_KEY` | `string` | *(optional)* | 64-hex-character AES-256-GCM encryption key for webhook notification secrets. Required in production/development if webhooks are configured (fails closed if missing). | Conditional |
| `STACKAUDIT_HOST` | `string` | *(none)* | Host address override used by the private network launcher (`npm run dev:private-network` / `npm run start:private-network`). | No |

---

## Detailed Variable Specifications

### 1. `STACKAUDIT_DEPLOYMENT_MODE`
Controls the deployment boundary:
- `local`: Enforces single-user workstation execution. Next.js binds strictly to `127.0.0.1`. Setting `HOST=0.0.0.0` or `HOSTNAME=0.0.0.0` is blocked to prevent accidental public exposure.
- `private-network`: Allows execution within an isolated private network (VPN or private subnet). Requires `STACKAUDIT_ALLOW_PRIVATE_NETWORK=true`.
- Any other value (such as `public`, `saas`, `multi-tenant`) is rejected on startup with a `ConfigurationError`.

### 2. `STACKAUDIT_WORKSPACE_ORG_ID`
- StackAudit scopes all data ingestion, attribution rules, outcome tracking, audit findings, and alerts to this single organization UUID.
- The server validates that this UUID exists in the `organizations` table on startup. If missing or invalid, API routes fail closed rather than leaking or guessing records.
- `STACKAUDIT_ORG_ID` is supported as an exact alias. If both are set, they must match.
- The pre-configured demo ID is `8a775c7f-e31c-8f9b-9000-000000000001`.

### 3. `STACKAUDIT_DATABASE_MODE`
Controls allowed database hostnames:
- `local`: Enforces that `NEXT_PUBLIC_SUPABASE_URL` points strictly to `localhost`, `127.0.0.1`, or `::1`. Any attempt to connect to an external host is blocked on startup.
- `remote`: Explicit operator override allowing external Supabase projects. *Note: Remote mode does not add multi-tenant safety.*

### 4. `SUPABASE_SERVICE_ROLE_KEY`
- Used exclusively by server-side Next.js route handlers and CLI scripts (`scripts/setup.ts`, `scripts/seed-demo-data.ts`).
- It bypasses PostgreSQL Row Level Security (RLS) to perform aggregations and maintenance.
- **Security Rule**: Never prefix this variable with `NEXT_PUBLIC_`. It must never be bundled into client-side JavaScript.

### 5. `DEMO_DATASET_END`
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
