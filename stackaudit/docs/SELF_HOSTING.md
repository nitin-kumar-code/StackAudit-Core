# Self-host StackAudit V0 locally

StackAudit V0 is a **single-user local preview** for one operator/developer. It is not hardened for shared hosting or multi-tenant use. Anyone who can reach the app can act as the operator. Keep the app and local Supabase on a trusted machine/network; do not expose them publicly or use them for sensitive production workloads.

## Prerequisites

- macOS, Linux, or Windows with a working Docker installation/daemon (Supabase local uses Docker containers).
- Node.js `22.22.2` or newer and npm. The lockfile includes packages with this engine requirement.
- The repository's locked Supabase CLI package is installed by `npm ci`; use `npx supabase` from the repository root.

No provider API credentials are needed. V0 usage ingestion is via canonical CSV. OpenAI and Anthropic adapters are not connected integrations.

## Clean local installation

Run from the repository root:

```sh
npm ci
cp .env.example .env.local
npx supabase start
npx supabase status
```

`supabase status` prints local endpoint credentials. Copy the local API URL and `service_role` key into `.env.local`; do not paste the service key into browser code, a `NEXT_PUBLIC_` variable, Git, screenshots, or issue reports. The normal local API URL is `http://127.0.0.1:54321`. Keep `STACKAUDIT_DATABASE_MODE=local`.

The active workspace setting must explicitly name an existing organization. For the included demo flow use:

```ini
STACKAUDIT_WORKSPACE_ORG_ID=8a775c7f-e31c-8f9b-9000-000000000001
```

The demo seed creates this organization with its ownership marker. If using another workspace, it must already exist, and the demo seeder will refuse it because demo cleanup is restricted to the fixed marked demo organization. The application does not silently select a first organization.

Apply schema migrations from an empty local database:

```sh
npx supabase db reset
```

This is destructive to the local Supabase database: it resets database contents and replays the ordered migrations. The migration history in `supabase/migrations/` is canonical. `full_setup.sql` is a legacy snapshot and must not be applied.

Load reviewed pricing fixtures and demo data:

```sh
npm run setup
```

`npm run setup` verifies that migrations already created the schema, loads reference pricing fixtures, and seeds the demo workspace; it does **not** run migrations itself. These two explicit alternatives are also available after migrations:

```sh
npm run pricing:load
npm run seed
```

The seed command loads pricing fixtures automatically if the catalog is empty. It replaces the dataset only for the organization carrying `demo_seed_key=stackaudit-demo-v1`; it preserves manual pricing rows and other organizations' data. `DEMO_SEED`, `DEMO_DATASET_DAYS`, and optional `DEMO_DATASET_END` control deterministic demo generation. See `.env.example` and [the root README](../README.md#reproducible-demo-data).

Start the web app:

```sh
npm run dev
```

Open `http://localhost:3000`. The Usage page provides the sample CSV and import instructions. API requests are same-origin to the local Next.js server. By default standard routes do not require a user login; access is scoped to the configured workspace. If a bearer token is supplied, its Supabase `app_metadata.organization_id` must match that workspace.

Stop local Supabase when finished:

```sh
npx supabase stop
```

## Environment variables

| Variable | Required | Use |
|---|---:|---|
| `STACKAUDIT_DATABASE_MODE` | Yes | Use `local` for this guide. Remote database targets require explicit `remote`, which does not make shared hosting supported. |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Despite the conventional prefix, the current app uses this setting from server-only database code. The browser does not create a Supabase client. For local mode, use a localhost URL. |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Server-only Supabase key for database access. It bypasses RLS; never expose it to browser code. |
| `STACKAUDIT_WORKSPACE_ORG_ID` | Yes | Explicit active workspace UUID; it must exist. Demo seeding requires the fixed demo UUID above. |
| `DEMO_SEED` | No | Non-negative integer seed; default `12345`. |
| `DEMO_DATASET_DAYS` | No | Number of days to generate; default `90`. |
| `DEMO_DATASET_END` | No | Optional exclusive UTC end timestamp for repeatable historical runs. Unset defaults to current UTC midnight. |
| `CRON_SECRET` | No | Enables the two internal maintenance routes. Keep secret; send as `Authorization: Bearer ...`. If unset, they return `503`. |
| `WEBHOOK_ENCRYPTION_KEY` | No | A 32-byte key encoded as 64 hexadecimal characters for webhook-secret encryption. There is no public configuration endpoint for channels in V0. **The current code falls back to a deterministic development key when unset; do not store real webhook secrets unless this is explicitly configured and key handling has been reviewed.** |
| `DATABASE_URL` / `POSTGRES_URL` | No | Direct PostgreSQL target for `npm run db:migrate`; must be local when `STACKAUDIT_DATABASE_MODE=local`. `supabase db reset` is the supported local fresh-install path. |

Copy `.env.example` to `.env.local` and keep `.env.local` private. Never put the service-role key in a `NEXT_PUBLIC_*` name.

## Migrations, data reset, and updates

- Fresh local database: `npx supabase db reset`.
- Apply pending migration files to an existing local database without resetting its data: `npx supabase migration up --local` ([Supabase CLI reference](https://supabase.com/docs/reference/cli/supabase-migration-up)).
- Apply reference prices: `npm run pricing:load`.
- Replace the demo dataset only: `npm run seed` or `npm run seed:reset` (both seed commands replace that marked dataset; they do not reset the database).
- Full local data reset: `npx supabase db reset`, then `npm run setup`.
- Update the app: pull the desired source revision, install with `npm ci`, review release notes/migrations, then apply forward migrations using the documented Supabase migration workflow. Do not run `full_setup.sql`.

`npm run db:migrate` is an auxiliary script. With `DATABASE_URL`/`POSTGRES_URL`, it runs every SQL file directly in name order and does not consult Supabase's migration history table; do not use it to repeatedly upgrade a database. Without a URL, local mode only prints the `supabase db reset` instruction. For local tracked upgrades use `npx supabase migration up --local`. Avoid using `remote` mode unless intentionally operating an isolated, authorized database; the product is not hardened for shared production hosting.

## Backup and restore expectations

The repository provides no scheduled backup, restore command, retention policy, or verified recovery test. A running local Docker volume is not a backup. Before relying on local records, make an operator-managed PostgreSQL backup using the database URL shown by `npx supabase status`, store it outside the Docker volume, and test restoring it into a disposable local stack. Keep backups encrypted and protected like the service-role key. `npx supabase db reset` drops/recreates the local database; it is not a backup or restore operation. CI uses disposable databases and contains no production credentials.

## Troubleshooting

- **`supabase: command not found`**: from this repo after `npm ci`, use `npx supabase ...`; the CLI is a locked project dependency.
- **Docker API / daemon error**: start Docker Desktop/the Docker daemon, then retry `npx supabase start`.
- **`STACKAUDIT_DATABASE_MODE` missing or remote host rejected**: set mode explicitly to `local` and use the local API URL.
- **Service-role key missing**: copy `SERVICE_ROLE_KEY` from local `npx supabase status` to `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`; do not rename it with `NEXT_PUBLIC_`.
- **Configured workspace not found**: run migrations and `npm run setup`, or set `STACKAUDIT_WORKSPACE_ORG_ID` to the ID of an existing local organization.
- **Pricing catalog empty**: run `npm run pricing:load`; the demo seed also attempts to load fixtures when the catalog is empty.
- **Usage page has no events**: run `npm run seed` or import the documented CSV; confirm event timestamps fall within the selected range.
- **Internal route returns `503`**: set `CRON_SECRET` in the server environment and restart the app.

## Scope and limitations

There is no built-in authentication/session UX, organization membership management, multi-tenant RLS policy, distributed rate limiter, automatic backup, provider credential store, scheduled provider sync, or managed deployment. The service role bypasses RLS, and local operator scope is enforced by application code. Do not expose this preview to untrusted users or claim production-grade tenant isolation. Review [SECURITY.md](../SECURITY.md) before use.
