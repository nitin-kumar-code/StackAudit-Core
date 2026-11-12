# Security Policy and Trust Boundary

StackAudit takes security seriously. As an open-source AI cost intelligence platform handling financial and operational metadata, we are committed to clear boundaries, safe secret handling, and responsible disclosure.

---

## Supported Versions

StackAudit is currently in its **V0 Developer Preview** release stage.

| Version | Supported | Description |
| :--- | :--- | :--- |
| `0.1.x` (V0 Preview) | :white_check_mark: | Active single-user, locally self-hosted developer preview |
| `< 0.1.0` | :x: | Internal development builds |

---

## V0 Security Architecture and Trust Boundary

> [!WARNING]
> **StackAudit V0 is a single-user, locally self-hosted developer preview.**
> It is designed to run on a trusted workstation or private developer network. It is not currently hardened for shared multi-tenant hosting, public internet exposure, or untrusted user environments.

### 1. Credentials and Secret Isolation
- **`SUPABASE_SERVICE_ROLE_KEY`**: Required by the backend server and setup scripts to execute administrative queries and database RPCs. This key bypasses Row Level Security (RLS). **Never expose this key to browser client code, never prefix it with `NEXT_PUBLIC_`, and never commit it to source control.**
- **`STACKAUDIT_DATABASE_MODE`**: Set to `local` by default. It strictly allows connections to localhost / `127.0.0.1`. Setting `STACKAUDIT_DATABASE_MODE=remote` is a deliberate operator opt-in and does not add tenant isolation.
- **Provider API Keys**: StackAudit V0 does **not** collect, store, or require your third-party provider API keys (OpenAI, Anthropic, Google, etc.). Usage ingestion is performed safely via offline CSV exports or sanitized internal API payloads.

### 2. Workspace Access Scope
- **`STACKAUDIT_WORKSPACE_ORG_ID`**: Every database operation is explicitly scoped to this configured organization UUID. The server validates that the organization exists on startup and fails closed if invalid.
- There is no public user authentication or multi-tenant authorization layer in V0. Anyone who can reach your local web server port acts as the local operator. Keep the application behind localhost or a secure VPN.

### 3. Database Hardening
- Row Level Security (RLS) is enabled across tables in `supabase/migrations/`.
- Direct table and function execution privileges are revoked from `PUBLIC`, `anon`, and `authenticated` browser roles.
- Database RPC aggregations are invoked with server-side service credentials.

---

## Reporting a Vulnerability

If you discover a security vulnerability in StackAudit, please do not disclose it publicly through GitHub Issues, pull requests, or public discussions.

### How to Report Privately
1. **GitHub Security Advisories (Preferred)**: Navigate to the repository's **Security** tab and click **"Report a vulnerability"** to submit an encrypted, private advisory.
2. **Direct Maintainer Contact**: If private advisories are unavailable, contact the project maintainers via the email listed on their GitHub profile with the subject line `[SECURITY] StackAudit Vulnerability Report`.

### What to Include
To help us triage and resolve the issue quickly, please provide:
- A clear description of the vulnerability and its potential impact.
- Step-by-step reproduction instructions or a minimal Proof of Concept (PoC).
- Affected files, functions, or API endpoints.
- Any suggested remediations or mitigations.

> [!CAUTION]
> **Never include active API keys, service-role tokens, production credentials, or unredacted confidential data in your report.**

### Our Commitment
- We will acknowledge receipt of your vulnerability report within **48 hours**.
- We will provide regular status updates during investigation and patch development.
- Once a fix is verified and released, we will credit the reporter in the release notes (unless anonymity is requested).
