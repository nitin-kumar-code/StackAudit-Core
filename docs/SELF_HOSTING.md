# Self-Host StackAudit V0 Locally

StackAudit V0 is a **single-user, local-first evidence ledger** for one operator/developer. It is not hardened for shared hosting or public multi-tenant use. Anyone who can reach the web port acts as the operator. Keep the app and local Supabase on a trusted machine or within an isolated, firewalled private network; do not expose them to the public internet or untrusted users.

---

## Prerequisites

- macOS, Linux, or Windows with a working Docker installation/daemon (Supabase local uses Docker containers).
- Node.js `22.22.2` or newer and npm.
- The repository's locked Supabase CLI package is installed by `npm ci`; use `npx supabase` from the repository root.

No provider API credentials are required. V0 usage ingestion is via offline canonical CSV exports.

---

## Clean Local Installation

Run from the `stackaudit/` directory:

```sh
npm ci
cp .env.example .env.local
npx supabase start
npx supabase status
```

`supabase status` prints local endpoint credentials. Copy the local API URL and `service_role` key into `.env.local`:
- Do not paste the service key into browser code, a `NEXT_PUBLIC_` variable, Git, screenshots, or issue reports.
- The default local API URL is `http://127.0.0.1:54321`.
- Keep `STACKAUDIT_DEPLOYMENT_MODE=local` and `STACKAUDIT_DATABASE_MODE=local`.

The active workspace setting must explicitly name an existing organization. For the included demo flow use:

```ini
STACKAUDIT_DEPLOYMENT_MODE=local
STACKAUDIT_DATABASE_MODE=local
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_SERVICE_ROLE_KEY=<service_role_key>
STACKAUDIT_WORKSPACE_ORG_ID=8a775c7f-e31c-8f9b-9000-000000000001
```

Apply schema migrations to an empty local database:

```sh
npx supabase db reset
```

Load reviewed reference pricing fixtures and demo data:

```sh
npm run setup
```

`npm run setup` loads reference pricing fixtures and seeds the demo workspace; it does **not** rewrite your `.env.local` or run migrations itself.

Start the web app:

```sh
# Local mode: strictly binds to 127.0.0.1:3000
npm run dev

# Or for production:
npm run build
npm start

# For isolated private network mode (requires STACKAUDIT_DEPLOYMENT_MODE=private-network and STACKAUDIT_ALLOW_PRIVATE_NETWORK=true):
npm run dev:private-network
# or in production:
npm run start:private-network
```

Both `npm run dev` and `npm run start` explicitly bind to `127.0.0.1:3000`. Open `http://localhost:3000` in your browser. The Usage page provides sample CSV templates and import tools.

Stop local Supabase when finished:

```sh
npx supabase stop
```

---

## Environment Variables Reference

| Variable | Required | Description |
| :--- | :---: | :--- |
| `STACKAUDIT_DEPLOYMENT_MODE` | **Yes** | `local` (default) or `private-network`. Rejects unsupported modes (`public`, `saas`). |
| `STACKAUDIT_ALLOW_PRIVATE_NETWORK` | Conditional | Must be set to `true` when `STACKAUDIT_DEPLOYMENT_MODE=private-network`. |
| `STACKAUDIT_WORKSPACE_ORG_ID` | **Yes** | Explicit active workspace UUID. Demo seeding requires the fixed demo UUID above. |
| `STACKAUDIT_ORG_ID` | No | Exact alias for `STACKAUDIT_WORKSPACE_ORG_ID`. If both are provided, they must match. |
| `STACKAUDIT_DATABASE_MODE` | **Yes** | Use `local`. Remote targets require explicit `remote`, which does not add multi-tenant isolation. |
| `NEXT_PUBLIC_SUPABASE_URL` | **Yes** | Endpoint URL. The browser does not connect directly to Supabase; used server-side. |
| `SUPABASE_SERVICE_ROLE_KEY` | **Yes** | Privileged server-only key. It bypasses RLS; never expose to client bundles. |
| `DEMO_SEED` | No | Non-negative integer seed; default `12345`. |
| `DEMO_DATASET_DAYS` | No | Number of days of synthetic events to generate; default `90`. |
| `DEMO_DATASET_END` | No | Optional exclusive UTC end timestamp. Defaults to current UTC midnight. |
| `CRON_SECRET` | No | Enables internal maintenance endpoints (`/api/v1/internal/*`). If unset, returns `503`. |
| `WEBHOOK_ENCRYPTION_KEY` | No | 32-byte key encoded as 64 hex characters for webhook secret encryption. |

---

## Scope and Security Limitations

- **No Multi-Tenancy**: StackAudit V0 has no user authentication UX, organization membership management, or tenant RBAC.
- **Service Role RLS Bypass**: The server accesses PostgreSQL via the service-role key, which bypasses RLS. Scoping is enforced entirely by TypeScript route queries.
- **Local Network Scope**: In `local` mode, access is restricted to loopback (`127.0.0.1`). In `private-network` mode, any reachable user inside the network has operator access.
- Review [DEPLOYMENT.md](DEPLOYMENT.md) and [SECURITY.md](../SECURITY.md) before deployment.
