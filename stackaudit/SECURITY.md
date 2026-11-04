# Security and V0 trust boundary

StackAudit V0 is a **single-user local preview** for one operator or developer. It is not hardened for shared production hosting and does not claim multi-tenant security. Do not expose the application or local Supabase instance to an untrusted network, and do not use it for sensitive production data.

## Configuration and credentials

- `STACKAUDIT_DATABASE_MODE=local` is required for the local preview. It accepts only `localhost`, `127.0.0.1`, or `::1` URLs.
- `STACKAUDIT_DATABASE_MODE=remote` is a deliberate opt-in to a remote Supabase project. This is not a supported shared-hosting mode and adds no remote authorization boundary.
- `NEXT_PUBLIC_SUPABASE_URL` identifies the Supabase endpoint. The browser does not connect to Supabase directly.
- `SUPABASE_SERVICE_ROLE_KEY` is required by the server and setup scripts. It bypasses RLS; keep it only in server-side `.env.local`/secret storage. Never expose it through a `NEXT_PUBLIC_` variable or client component.
- `STACKAUDIT_WORKSPACE_ORG_ID` is the required UUID for the one active workspace. The application validates the UUID and verifies that the organization exists at request time. Missing or invalid configuration fails closed; there is no first-organization fallback.
- Demo seed commands use privileged credentials and are restricted to localhost. Review their destructive scope and use a disposable local database.

## Access model

The browser calls the StackAudit API. API handlers use the server-side service-role client and scope organization data to `STACKAUDIT_WORKSPACE_ORG_ID`. An optional Supabase bearer token must resolve to that same configured organization; request data cannot switch workspaces. Internal maintenance routes require `CRON_SECRET` and are also limited to the configured workspace.

The database migration enables RLS on public tables and removes table/function privileges from `PUBLIC`, `anon`, and `authenticated`. No permissive browser policies are installed. The server service role bypasses RLS, so route scoping and local network trust remain essential. RPCs are invoker functions (no security-definer functions were found in the migration set); browser roles cannot execute them after the migration.

## Remaining limitations

There is no login/session requirement for the local preview: anyone who can reach the application can act as its single operator. The service role can access all records in the connected database, and the configured workspace is an application-level scope, not a tenant isolation guarantee against server compromise or unsafe code. `remote` mode should be used only with a disposable or otherwise explicitly authorized project. Production/shared use requires a separate architecture and security review.

## Future multi-user architecture requirements

Before shared hosting, add real user authentication and session handling; server-derived organization membership and role checks on every request; tenant-aware data access with RLS policies validated under `anon`/`authenticated` roles; least-privilege database roles and narrowly granted RPCs; secure onboarding and membership lifecycle; secret management and rotation; rate limits, audit logging, CSRF/origin protections where applicable; and automated cross-tenant integration tests. Do not treat this preview's service-role filtering as sufficient tenant isolation.

## Reporting a vulnerability

Do not publish exploitable details in a public issue. Use GitHub's private vulnerability reporting if enabled; otherwise contact the repository owner privately. Never include API keys, service-role credentials, customer data, or unredacted logs in a report.
