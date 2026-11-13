# StackAudit V0 — Deployment Guide & Security Boundary

StackAudit V0 is an open-source, evidence-oriented ledger and cost intelligence application for AI usage.

> [!IMPORTANT]
> **StackAudit V0 is a single-user, local-first application.**
> It is designed to run exclusively on an operator's workstation or within an explicitly controlled, isolated private network boundary.
> It is **NOT** a public multi-tenant SaaS application.

---

## 1. Architectural Contract and Deployment Boundary

StackAudit V0 enforces the following strict architectural rules:

1. **Single Operator Workspace**: All database queries, usage ingestion, attribution rules, audits, and alerts are bound to **one explicitly configured organization UUID** (`STACKAUDIT_WORKSPACE_ORG_ID` or `STACKAUDIT_ORG_ID`).
2. **No Implicit Selection**: The application never guesses or automatically selects an arbitrary organization. It fails closed if the configured workspace is missing, malformed, or absent from the database.
3. **Localhost Binding by Default**: Both development (`npm run dev`) and production (`npm run start`) scripts explicitly bind to `127.0.0.1` (`-H 127.0.0.1`). Wildcard binding (`0.0.0.0`) is prohibited in local mode.
4. **No Public Multi-Tenancy**: StackAudit V0 does not provide multi-tenant user authentication, password hashing, session cookies, organization membership management, or declarative cross-tenant Row-Level Security (RLS) policies.
5. **Server-Side Service Role Key**: Database operations utilize the Supabase `service_role` key exclusively on the server (`lib/supabase/client.ts`). The service-role key is never exposed to browser bundles or client components.

---

## 2. Supported Deployment Modes

### Mode A: Local Workstation (Default & Recommended)

This is the standard and safest way to run StackAudit V0.

```ini
STACKAUDIT_DEPLOYMENT_MODE=local
STACKAUDIT_DATABASE_MODE=local
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_SERVICE_ROLE_KEY=<your-local-service-role-key>
STACKAUDIT_WORKSPACE_ORG_ID=8a775c7f-e31c-8f9b-9000-000000000001
```

- **Host Binding**: Strictly bound to `127.0.0.1:3000`. The server rejects binding to `0.0.0.0`.
- **Database**: Strictly requires a localhost Supabase instance (`localhost`, `127.0.0.1`, `::1`).
- **Access Boundary**: Accessible only from the local machine loopback interface.

#### Startup Commands:
```bash
# Start local Supabase container
npx supabase start

# Apply migrations
npx supabase db reset

# Setup reference pricing fixtures and demo data
npm run setup

# Run local development server (bound to 127.0.0.1)
npm run dev
```

---

### Mode B: Isolated Private Network (Explicit Opt-In)

StackAudit V0 can be deployed within an explicitly controlled private network (such as a corporate VPN or private subnet) for a trusted engineering team or solo operator.

> [!WARNING]
> In private network mode, **all users who can reach the application's network port act with full operator privileges**. There are no individual user logins or role-based access restrictions. Do not deploy in this mode unless the network boundary is fully isolated and all reachable users are trusted.

#### Required Configuration:
```ini
STACKAUDIT_DEPLOYMENT_MODE=private-network
STACKAUDIT_ALLOW_PRIVATE_NETWORK=true
STACKAUDIT_DATABASE_MODE=local
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
STACKAUDIT_WORKSPACE_ORG_ID=8a775c7f-e31c-8f9b-9000-000000000001
```

#### Mandatory Security Controls for Private Network Mode:
1. **Network Firewall / VPN**: The host must be protected by a strict ingress firewall rule or VPN gateway. Untrusted or guest network segments must not route traffic to the application port.
2. **No Public IP Binding**: The application must never be assigned a public IPv4/IPv6 address or exposed via a public reverse proxy without external authentication.
3. **Explicit Opt-In**: Setting `STACKAUDIT_DEPLOYMENT_MODE=private-network` without `STACKAUDIT_ALLOW_PRIVATE_NETWORK=true` causes the application to fail closed on startup with a `ConfigurationError`.
4. **Single Workspace Constraint**: Even in private network mode, the instance remains scoped to the single configured workspace. It does not provide per-user or per-team multi-tenancy.
5. **Dedicated Launch Commands**: Standard `npm run dev` and `npm start` commands strictly enforce `-H 127.0.0.1` loopback binding. To bind to the private network interface, use the dedicated private-network scripts:
   ```bash
   # In development:
   npm run dev:private-network

   # In production:
   npm run build
   npm run start:private-network
   ```
   The runner (`scripts/run-server.ts`) validates that private-network mode is explicitly opted into, binds to `STACKAUDIT_HOST` (or `HOST`, defaulting to `0.0.0.0`), and prints a prominent operator security advisory.

---

## 3. Strictly Unsupported Deployment Scenarios

StackAudit V0 **MUST NEVER** be deployed in any of the following configurations:

| Unsupported Scenario | Risk / Reason |
| :--- | :--- |
| **Public Multi-Tenant SaaS** | Absence of real user authentication, session validation, organization membership tables, and database-level tenant isolation. |
| **Public Internet-Facing Service** | Any unauthenticated user who can reach the web server or API acts as the operator of the configured workspace. |
| **Shared Hosting for Unrelated Clients / Agencies** | Service-role access bypasses PostgreSQL RLS. Multiple organizations cannot safely share a single database or application instance. |
| **Untrusted Multi-User Environments** | In-process rate limiters and background memory structures are designed for single-operator workloads and do not protect against untrusted concurrent actors. |

Attempting to set `STACKAUDIT_DEPLOYMENT_MODE=public`, `saas`, `multi-tenant`, or `shared` will cause the application to fail closed on startup with a fatal configuration error.

---

## 4. Environment Variables Reference

| Variable | Type | Allowed Values | Default | Description | Required |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `STACKAUDIT_DEPLOYMENT_MODE` | `string` | `local`, `private-network` | `local` | Enforces the application deployment security boundary. Unsupported values fail closed. | Yes |
| `STACKAUDIT_ALLOW_PRIVATE_NETWORK` | `boolean` | `true`, `false` | `false` | Explicit operator acknowledgment required when using `private-network` mode. | Only for private-network |
| `STACKAUDIT_WORKSPACE_ORG_ID` | `UUID` | RFC-4122 UUID | `8a775c7f-e31c-8f9b-9000-000000000001` | Active workspace UUID for all data scoping. | **Yes** |
| `STACKAUDIT_ORG_ID` | `UUID` | RFC-4122 UUID | *(none)* | Supported alias for `STACKAUDIT_WORKSPACE_ORG_ID`. If both are provided, they must match. | No |
| `STACKAUDIT_DATABASE_MODE` | `string` | `local`, `remote` | `local` | Validates target database host. `local` requires localhost/127.0.0.1. | **Yes** |
| `NEXT_PUBLIC_SUPABASE_URL` | `string` | Valid URL | `http://127.0.0.1:54321` | Base URL of the Supabase API endpoint. | **Yes** |
| `SUPABASE_SERVICE_ROLE_KEY` | `string` | Secret key string | *(none)* | Server-only privileged service key. Must never be exposed to browser bundles. | **Yes** |
| `CRON_SECRET` | `string` | High-entropy string | *(none)* | Shared secret for internal maintenance endpoints (`/api/v1/internal/*`). | Optional |
| `WEBHOOK_ENCRYPTION_KEY` | `string` | 64 hex characters (32 bytes) | *(none)* | AES-256-GCM encryption key for webhook secrets. | Optional |
| `HOST` / `HOSTNAME` | `string` | `127.0.0.1`, `localhost` | `127.0.0.1` | Network interface to bind. Wildcard `0.0.0.0` is blocked in `local` mode. | No |

---

## 5. Security Guardrails and Fail-Closed Protections

The application enforces active guardrails at multiple layers:

1. **Host Binding Validation & Multi-Layer Enforcement (`lib/deployment.ts`, `package.json`)**:
   - Environment-level inspection: `validateNetworkBinding()` checks process environment variables (`HOST`, `HOSTNAME`, `STACKAUDIT_HOST`). In `local` mode, any non-loopback host (including `0.0.0.0`, `::`, or private LAN IPs like `10.x.x.x` and `192.168.x.x`) throws `ConfigurationError` immediately.
   - Command-level enforcement: `npm run dev` and `npm start` explicitly pass `-H 127.0.0.1` to the Next.js CLI. Together, these two layers prevent accidental exposure to LAN or public interfaces.
2. **Workspace ID Validation (`lib/deployment.ts`)**:
   - Validates UUID syntax.
   - Verifies the organization exists in PostgreSQL (`organizations` table).
   - Rejects conflicting workspace variables.
   - Refuses to guess or fall back to arbitrary database records.
3. **Database Target Guardrails (`lib/supabase/database-target.ts`)**:
   - Blocks connection to non-local Supabase URLs when `STACKAUDIT_DATABASE_MODE=local`.
   - Requires explicit `STACKAUDIT_DATABASE_MODE=remote` before connecting to external endpoints.
4. **Service-Role Key Shielding**:
   - `lib/supabase/client.ts` uses `import 'server-only'` to prevent bundling into client-side code.
   - Automated test suite verifies zero client components import `supabaseAdmin`.
5. **HTTP Security Headers (`next.config.ts`)**:
   - `X-Frame-Options: DENY` (anti-clickjacking)
   - `X-Content-Type-Options: nosniff` (anti-MIME sniffing)
   - `Referrer-Policy: strict-origin-when-cross-origin`
   - `Permissions-Policy: camera=(), microphone=(), geolocation=()`
6. **Webhook Secret Encryption Fail-Closed Safeguards (`lib/crypto.ts`)**:
   - Webhook secrets are encrypted with AES-256-GCM.
   - Outside automated test suites, `WEBHOOK_ENCRYPTION_KEY` must be configured as a 64-character hexadecimal key (32 bytes).
   - If the key is missing in production or development, `getEncryptionKey()` and `encryptSecret()` fail closed immediately. No hardcoded or deterministic fallback key is ever used in runtime environments.
7. **Internal Cron Endpoint Scoping (`app/api/v1/internal/*`)**:
   - Scheduled maintenance endpoints (`/api/v1/internal/monitoring/run` and `/api/v1/internal/usage/reprice`) are strictly scoped to the single configured workspace (`STACKAUDIT_WORKSPACE_ORG_ID`).
   - They require `CRON_SECRET` authentication and reject any caller-supplied organization override parameter.

---

## 6. Requirements for Future Multi-Tenant Editions

Before StackAudit can be safely deployed as a public, multi-tenant SaaS application, the following architectural capabilities must be implemented and independently audited:

1. **Real User Identity & Session Management**:
   - User table, secure password hashing (Argon2id/bcrypt), OAuth session cookies, CSRF protection, and session revocation.
2. **Declarative Database Row-Level Security (RLS)**:
   - Migration from `service_role` bypassing RLS to user-authenticated PostgreSQL connections (`authenticated` role) with strict `USING (organization_id = auth.jwt() ->> 'organization_id')` policies on all tables.
3. **Tenant Membership & Role-Based Access Control (RBAC)**:
   - Organization invitations, user-to-organization membership mappings, and granular roles (`owner`, `admin`, `analyst`, `viewer`).
4. **Per-Tenant Authorization Boundaries**:
   - Server-side tenant verification middleware validating membership on every API route and server action.
5. **Cross-Tenant Isolation Test Harness**:
   - Automated regression test suite executing concurrent requests across multiple organizations to prove zero cross-tenant data leakage.
6. **Production Secrets Management & Audit Logging**:
   - KMS/Vault integration for tenant provider API keys and tamper-evident audit logs.
