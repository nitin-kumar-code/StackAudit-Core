# Security Policy and Trust Boundary

StackAudit takes security seriously. As an open-source AI cost intelligence and evidence ledger platform handling operational and financial metadata, we maintain strict architectural boundaries, explicit configurations, and responsible disclosure practices.

---

## 1. Supported Versions

StackAudit is currently in its **V0 Single-User Developer Preview** release stage.

| Version | Supported | Architecture | Intended Deployment |
| :--- | :--- | :--- | :--- |
| `0.1.x` (V0 Preview) | :white_check_mark: | Single-User, Local-First Evidence Ledger | Local operator workstation (`127.0.0.1`) or private isolated network |
| `< 0.1.0` | :x: | Internal development builds | Not supported |

---

## 2. V0 Security Architecture and Trust Boundary

> [!WARNING]
> **StackAudit V0 is a single-user, local-first evidence ledger.**
> It is designed to run exclusively on an operator's workstation (`127.0.0.1`) or within an explicitly controlled, isolated private network boundary behind a firewall or VPN.
> **It is NOT a public multi-tenant SaaS application.**
> It must never be deployed as an unauthenticated internet-facing service or shared multi-user application.

### A. Credentials and Secret Isolation
- **`SUPABASE_SERVICE_ROLE_KEY`**: Required by the backend server and CLI scripts (`scripts/setup.ts`, `scripts/seed-demo-data.ts`) to execute administrative aggregations and RPCs. **This key bypasses Row Level Security (RLS)** in PostgreSQL. It is marked `server-only` in `lib/supabase/client.ts` and is never exposed to browser bundles, public environment variables, or API responses.
- **`STACKAUDIT_DEPLOYMENT_MODE`**: Set to `local` by default. It strictly enforces `127.0.0.1` binding and rejects wildcard (`0.0.0.0`) or LAN host bindings. Setting `STACKAUDIT_DEPLOYMENT_MODE=private-network` requires explicit `STACKAUDIT_ALLOW_PRIVATE_NETWORK=true` acknowledgment and launching via dedicated private-network scripts.
- **`STACKAUDIT_DATABASE_MODE`**: Set to `local` by default. It enforces connections to `localhost`, `127.0.0.1`, or `::1`. Remote database connections require explicit `STACKAUDIT_DATABASE_MODE=remote`.
- **`WEBHOOK_ENCRYPTION_KEY`**: AES-256-GCM key used to encrypt and decrypt webhook notification secrets. Fails closed in production and development if missing; no hardcoded or deterministic fallback key is used outside automated tests.
- **Internal Cron Endpoints**: Endpoints under `/api/v1/internal/*` (`/run` and `/reprice`) require `CRON_SECRET` authentication, are strictly scoped to the single configured `STACKAUDIT_WORKSPACE_ORG_ID`, and reject caller organization overrides.
- **Third-Party Provider API Keys**: StackAudit V0 does **not** collect, store, or require third-party provider API keys (OpenAI, Anthropic, Google, etc.). Usage ingestion is performed offline via sanitized canonical CSV exports.

### B. Single Workspace Access Scope
- **`STACKAUDIT_WORKSPACE_ORG_ID`** (or alias `STACKAUDIT_ORG_ID`): Every database operation and API route is explicitly scoped to this single organization UUID.
- The server validates that this UUID exists in PostgreSQL on startup and fails closed if invalid.
- The server **never** silently creates an organization, never selects the first organization implicitly, and never falls back to arbitrary records.
- User-supplied identifiers in query parameters or request bodies cannot override the configured workspace.

### C. Database Hardening and Service-Role Bypass Assessment
- Row Level Security (RLS) is enabled across all public tables via migration `20261031000000_single_user_local_preview_boundary.sql`.
- Direct table, sequence, and function execution privileges are revoked from `PUBLIC`, `anon`, and `authenticated` browser roles.
- Default privileges revoke future table access from browser roles.
- **Service-Role Bypass Reality**: The application server uses a service-role client (`supabaseAdmin`) that bypasses PostgreSQL RLS. Therefore, **PostgreSQL RLS does not provide multi-tenant isolation within the application layer**. All workspace isolation is enforced by application-level queries (`.eq('organization_id', orgId)`).

---

## 3. Strictly Unsupported Deployment Scenarios

StackAudit V0 **must not** be deployed as:

1. **A public multi-tenant SaaS application**: StackAudit V0 lacks user registration, session management, password hashing, and database-level tenant isolation.
2. **An unauthenticated internet-facing service**: Any caller who can reach the web port acts as the operator of the configured workspace.
3. **A shared service for unrelated organizations or agency clients**: Multiple organizations cannot safely share an instance because service-role access bypasses RLS and internal rate limiters are single-process.
4. **An untrusted multi-user network**: Running on an open or public Wi-Fi network exposes full operator access to all adjacent network users.

Attempting to configure `STACKAUDIT_DEPLOYMENT_MODE=public`, `saas`, `multi-tenant`, or `shared` will cause the application to fail closed on startup.

---

## 4. Requirements for a Future Multi-Tenant Edition

Before StackAudit can be safely offered as a public multi-tenant SaaS platform, the following architectural capabilities must be implemented, verified, and independently audited:

- [ ] **Real User Authentication**: User identity schema, password hashing (Argon2id/bcrypt), MFA, and email verification.
- [ ] **Server-Side Session Validation**: Cryptographically signed HTTP-only cookies, session revocation, and CSRF protection.
- [ ] **Declarative PostgreSQL Row-Level Security (RLS)**: Migration from `service_role` bypassing RLS to user-authenticated PostgreSQL connections (`authenticated` role) with strict `USING (organization_id = auth.jwt() ->> 'organization_id')` policies on every table.
- [ ] **Organization Membership & Tenancy RBAC**: Multi-tenant organization tables, membership invitations, and granular role assignments (`owner`, `admin`, `member`, `auditor`).
- [ ] **Tenant-Scoped Authorization on Every Protected Operation**: Server-side authorization middleware validating tenant membership and roles on every API route and server action.
- [ ] **Cross-Tenant Isolation Regression Test Suite**: Automated end-to-end tests proving that concurrent requests across distinct organizations cannot observe or modify foreign tenant data.
- [ ] **Secure Credential Management**: Hardware Security Module (HSM) or cloud KMS/Vault integration for tenant provider keys.
- [ ] **Audit Logging and Security Monitoring**: Tamper-evident audit trails recording all data modifications, administrative actions, and access attempts.

> [!NOTE]
> The capabilities above are **future requirements**, not existing capabilities of StackAudit V0.

---

## 5. Reporting a Vulnerability

If you discover a security vulnerability in StackAudit, please do not disclose it publicly through GitHub Issues, pull requests, or public discussions.

### How to Report Privately
1. **GitHub Security Advisories (Preferred)**: Navigate to the repository's **Security** tab and click **"Report a vulnerability"** to submit an encrypted, private advisory.
2. **Direct Maintainer Contact**: If private advisories are unavailable, contact project maintainers via the email listed on their GitHub profile with the subject line `[SECURITY] StackAudit Vulnerability Report`.

### What to Include
- A clear description of the vulnerability and its potential impact.
- Step-by-step reproduction instructions or a minimal Proof of Concept (PoC).
- Affected files, functions, or API endpoints.
- Any suggested mitigations.

> [!CAUTION]
> **Never include active API keys, service-role tokens, production credentials, or unredacted confidential data in your report.**

### Our Commitment
- We will acknowledge receipt of your vulnerability report within **48 hours**.
- We will provide regular status updates during investigation and patch development.
- Once a fix is verified and released, we will credit the reporter in release notes (unless anonymity is requested).
