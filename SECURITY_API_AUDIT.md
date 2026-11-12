# StackAudit — API, Database, and Authorization Security Audit

**Assessment Date:** November 10, 2026 (Updated: November 12, 2026)  
**Auditor:** Senior Backend Security Engineer  
**Scope:** StackAudit API routes, server actions, database queries, authentication, authorization, and data access boundaries  
**Test Suite Status:** 24/24 test files passing, 162/162 tests passing  

---

## 1. Executive Summary & Deployment-Readiness Verdict

### Deployment-Readiness Verdict: **NOT READY FOR MULTI-TENANT HOSTED PRODUCTION**

> [!CAUTION]
> **Definitive Assessment:** StackAudit V0 is architecturally designed and hardened solely as a **single-user local preview** on an operator's local workstation. It **must not** be deployed as a multi-tenant or shared hosted application.

#### Core Architectural Realities:
1. **Service-Role Dominance:** All application data operations are executed using the PostgreSQL `service_role` superuser key via `supabaseAdmin`. In PostgreSQL, service-role queries bypass Row-Level Security (RLS) entirely. Multi-tenant isolation at the database layer is currently non-existent for application queries; isolation relies 100% on application-level filtering (`.eq('organization_id', orgId)`).
2. **Absence of User Session & Identity Model:** There is no user authentication table, session management, password hashing, OAuth session cookie, or RBAC (Role-Based Access Control). In local mode (`STACKAUDIT_DATABASE_MODE=local`), requests without an `Authorization` header are implicitly treated as the authorized operator of `STACKAUDIT_WORKSPACE_ORG_ID`.
3. **Defense-in-Depth Deficits:** No CSRF validation, no Origin/Referer header enforcement on state-mutating requests, and no per-user rate limiting.

StackAudit is defensible **only** when bound to `localhost` / `127.0.0.1` as a local developer evidence ledger.

---

## 2. Threat Model & Attack Surface

### 2.1 Threat Actors

```mermaid
flowchart TD
    subgraph Untrusted Network / Browser
        Attacker["Remote Attacker / Untrusted Network"]
        MaliciousWeb["Malicious Third-Party Website (CSRF/Rebinding)"]
        UntrustedTenant["Hostile Tenant / User (in shared environment)"]
    end

    subgraph StackAudit V0 Application
        API["Next.js API Layer (App Router)"]
        AuthMiddleware["Workspace Resolver (lib/auth.ts)"]
        AppServices["Core Services (Audit, Workload, Ingestion)"]
    end

    subgraph Infrastructure
        SupabaseDB[("Supabase PostgreSQL (Bypasses RLS via service_role)")]
        ExternalHook["External Webhook Receivers"]
    end

    Attacker -.->|"Attempt unauthenticated access"| API
    MaliciousWeb -.->|"Cross-origin fetch / Rebinding"| API
    UntrustedTenant -.->|"Cross-org IDOR / parameter tampering"| API
    API --> AuthMiddleware
    AuthMiddleware --> AppServices
    AppServices -->|"Unrestricted DB access"| SupabaseDB
    AppServices -->|"Outbound notification"| ExternalHook
```

1. **Local Operator (Trusted):** The individual developer running the app locally.
2. **Network-Adjacent Attacker (Untrusted):** Actors on the same Wi-Fi/LAN who attempt to access the local web server if bound to `0.0.0.0`.
3. **Malicious Web Page / Browser Script (Untrusted):** A browser tab executing malicious JavaScript that sends cross-origin requests (`fetch('http://localhost:3000/api/v1/...')`) or exploits DNS rebinding to control the local instance without authentication.
4. **Hostile Webhook Target / SSRF Adversary (Untrusted):** An internal infrastructure asset (cloud metadata service `169.254.169.254`, loopback `127.0.0.1`, VPC internal service `10.x.x.x`) targeted via outbound notification channels.
5. **Cross-Tenant Adversary (Untrusted in future shared hosting):** A user belonging to Organization A attempting to read or modify data of Organization B.

### 2.2 Attack Surface Inventory

#### API Routes (17 Endpoints):
| Endpoint | Method | Authentication | Authorization Scoping | Risk Level |
|---|---|---|---|---|
| `/api/v1/workloads` | `GET` | Optional Bearer (`getAuthOrgId`) | Scoped to active workspace | Medium |
| `/api/v1/workloads` | `POST` | Optional Bearer (`getAuthOrgId`) | Scoped to active workspace | Medium |
| `/api/v1/workloads/[id]` | `GET`, `PATCH`, `DELETE` | Optional Bearer (`getAuthOrgId`) | `id` + `organization_id` | Medium |
| `/api/v1/workloads/[id]/attribution-rules` | `GET`, `POST` | Optional Bearer (`getAuthOrgId`) | `workload_id` + `organization_id` | Medium |
| `/api/v1/workloads/[id]/attribution-rules/[ruleId]` | `DELETE` | Optional Bearer (`getAuthOrgId`) | `id` + `workload_id` + `org_id` | Medium |
| `/api/v1/usage` | `GET` | Optional Bearer (`getAuthOrgId`) | `p_organization_id` in RPC | Medium |
| `/api/v1/usage/import` | `POST` | Optional Bearer (`getAuthOrgId`) | `organization_id` | High |
| `/api/v1/outcomes` | `POST` | Optional Bearer (`getAuthOrgId`) | Validates `workload_id` in org | Medium |
| `/api/v1/outcomes` | `GET` | Optional Bearer (`getAuthOrgId`) | `p_organization_id` in RPC | Low |
| `/api/v1/analytics/cost-per-outcome` | `GET` | Optional Bearer (`getAuthOrgId`) | `p_organization_id` in RPC | Low |
| `/api/v1/audits` | `GET`, `POST` | Optional Bearer (`getAuthOrgId`) | `workload_id` + `organization_id` | High |
| `/api/v1/alerts` | `GET` | Optional Bearer (`getAuthOrgId`) | `organization_id` | Low |
| `/api/v1/alerts/[id]/resolve` | `POST` | Optional Bearer (`getAuthOrgId`) | `id` + `organization_id` | Low |
| `/api/v1/alerts/[id]/acknowledge` | `POST` | Optional Bearer (`getAuthOrgId`) | `id` + `organization_id` | Low |
| `/api/v1/dashboard/summary` | `GET` | Optional Bearer (`getAuthOrgId`) | `p_organization_id` in RPC | Medium |
| `/api/v1/dashboard/trends` | `GET` | Optional Bearer (`getAuthOrgId`) | `p_organization_id` in RPC | Medium |
| `/api/v1/monitoring/run` | `POST` | Optional Bearer (`getAuthOrgId`) | Scoped to active workspace | Medium |
| `/api/v1/internal/usage/reprice` | `POST` | `CRON_SECRET` Bearer | Scoped to active workspace | Critical |
| `/api/v1/internal/monitoring/run` | `POST` | `CRON_SECRET` Bearer | Scoped to active workspace | Critical |

#### Server Actions:
None exist in the codebase. All UI interactions use standard Next.js App Router client components dispatching `fetch` calls to `/api/v1/...`.

#### External Outbound Fetching & Webhooks:
- `WebhookChannel.send()` in `core/monitoring/alerts/channels/webhook.ts` issues HTTPS POST requests with JSON payloads to user-configured notification URLs.

#### File Upload & CSV Import Paths:
- `POST /api/v1/usage/import` receives `multipart/form-data` containing a `file` field parsed via `validateCanonicalCsv()`.

---

## 3. Detailed Audit Findings & Remediations

### Finding 1: Critical — Authentication Bypass on All Data Routes via Local-Fallback in Remote/Unauthenticated Context

- **Severity:** Critical (CVSS: 9.1 / AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:N)
- **Vulnerability Description:** In `lib/auth.ts`, `getAuthOrgId` accepted unauthenticated requests if the `Authorization` header was absent:
  ```ts
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return orgId; // Returns STACKAUDIT_WORKSPACE_ORG_ID
  ```
  If an operator pointed the database to a remote Supabase instance (`STACKAUDIT_DATABASE_MODE=remote`), this fallback remained active. Any network client could omit the Authorization header and manipulate all workloads, outcomes, attribution rules, and alerts.
- **Remediation Implemented:**
  Updated `getAuthOrgId` to strictly require authentication when running against remote databases:
  ```ts
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    const mode = process.env.STACKAUDIT_DATABASE_MODE;
    if (mode === 'remote') {
      throw new UnauthorizedError('Authentication required in remote mode');
    }
    return orgId;
  }
  ```
- **Regression Test:** Added to `lib/__tests__/security-audit.test.ts`:
  - `strictly rejects unauthenticated requests when STACKAUDIT_DATABASE_MODE=remote` (verified throws `UnauthorizedError`).
  - `allows unauthenticated requests in local mode as the single operator`.

---

### Finding 2: High — SSRF Vulnerability, DNS Rebinding (TOCTOU), and Hexadecimal IPv6 Mapped Address Bypasses in Webhook Notifications

- **Severity:** High (CVSS: 8.6 / AV:N/AC:L/PR:L/UI:N/S:C/C:H/I:N/A:N)
- **Vulnerability Description:** In `core/monitoring/alerts/channels/webhook.ts`:
  1. **DNS Rebinding (TOCTOU Gap):** `validateWebhookUrl(config.url)` resolved and checked the hostname, but subsequent `fetch(config.url)` performed a second independent DNS resolution at the socket connect layer. A malicious DNS server returning a public IP during validation and a private IP (`127.0.0.1`, `169.254.169.254`) on connect could bypass the check.
  2. **Hexadecimal IPv4-Mapped IPv6 Bypasses:** The previous implementation extracted mapped IPv4 addresses only when the suffix was dotted decimal (`::ffff:127.0.0.1`). Hexadecimal representations allowed under RFC 4291 such as `::ffff:7f00:1` or IPv4-compatible `::7f00:1` fell through and bypassed inspection.
  3. **Dual-Stack Bypass:** Resolving only IPv4 if `resolve4` succeeded allowed dual-stack hostnames returning a public IPv4 and an internal IPv6 to connect to internal IPv6 addresses via undici Happy Eyeballs.
  4. **Unblocked CIDR Ranges:** Failed to block Carrier-Grade NAT (`100.64.0.0/10`), Benchmarking (`198.18.0.0/15`), IPv6 Link-Local (`fe80::/10`), IPv6 Unique Local (`fc00::/7`), Documentation (`2001:db8::/32`), and Discard (`100::/64`).
- **Remediation Implemented:**
  1. **Byte-Level IPv6 Normalization:** Implemented `parseIPv6ToBytes()` to parse and normalize any IPv6 address into a 16-byte buffer, comprehensively validating dotted-decimal and hexadecimal IPv4-mapped (`::ffff:0:0/96`), IPv4-compatible (`::/96`), ULA, link-local, documentation, and NAT64 ranges.
  2. **Connection IP Pinning:** `validateWebhookUrl()` returns the resolved, validated public IP (`{ pinnedIp, family }`). `WebhookChannel.send()` constructs a dedicated Undici `Agent` with a custom `connect: { lookup }` function that binds the outbound socket directly to the validated IP, eliminating the TOCTOU DNS rebinding window while preserving TLS SNI and server certificate verification.
  3. **Concurrent Dual-Stack Resolution:** Concurrently resolves both IPv4 and IPv6 via `Promise.allSettled()`, verifying that every resolved IP is public.
- **SSRF Claim Clarification & Residual Defense-in-Depth:**
  While application-layer DNS inspection, byte-level IPv6 normalization, and socket IP pinning mitigate direct SSRF and DNS rebinding in Node.js, application-layer controls are not a replacement for network-layer egress filtering. In production environments, outbound webhook traffic must be routed through an egress proxy or VPC firewall with strict destination IP enforcement.
- **Regression Tests:** Added to `lib/__tests__/security-audit.test.ts`:
  - `blocks private IPv4 ranges (10.x, 127.x, 169.254.x, 192.168.x, 172.16-31.x)`
  - `blocks private, loopback, ULA, and link-local IPv6 ranges`
  - `blocks IPv4-mapped and IPv4-compatible IPv6 addresses in dotted decimal`
  - `blocks IPv4-mapped and IPv4-compatible IPv6 addresses in hexadecimal format` (`::ffff:7f00:1`, `::ffff:a00:1`, `::7f00:1`)
  - `rejects non-HTTPS webhook URLs`
  - `rejects raw IP hostnames targeting private/internal endpoints`
  - `validates dual-stack DNS resolutions and blocks if either IPv4 or IPv6 is internal`
  - `pins validated IP address to prevent DNS rebinding TOCTOU`

---

### Finding 3: Medium — Timing Side-Channel on `CRON_SECRET` in Internal Maintenance Endpoints

- **Severity:** Medium (CVSS: 5.3 / AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:N/A:N)
- **Vulnerability Description:** In `app/api/v1/internal/usage/reprice/route.ts` and `app/api/v1/internal/monitoring/run/route.ts`:
  ```ts
  const token = authHeader?.replace('Bearer ', '').trim();
  if (!token || token !== cronSecret) { ... }
  ```
  1. Standard `!==` comparison executes in variable time dependent on byte matching, enabling timing attacks to guess the secret byte-by-byte.
  2. `replace('Bearer ', '')` was case-sensitive and failed on `bearer <secret>`.
- **Remediation Implemented:**
  1. Implemented case-insensitive regex parsing: `authHeader?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim()`.
  2. Enforced constant-time comparison using `crypto.timingSafeEqual`:
     ```ts
     const tokenBuf = Buffer.from(token);
     const secretBuf = Buffer.from(cronSecret);
     if (tokenBuf.length !== secretBuf.length || !crypto.timingSafeEqual(tokenBuf, secretBuf)) {
       return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
     }
     ```
- **Regression Test:** Added `performs constant-time secret comparison via timingSafeEqual` in `security-audit.test.ts`.

---

### Finding 4: Medium — Weak Static Fallback Key and Plaintext Leak in Webhook Crypto

- **Severity:** Medium (CVSS: 5.9 / AV:L/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N)
- **Vulnerability Description:** In `lib/crypto.ts`:
  - When `WEBHOOK_ENCRYPTION_KEY` was missing, `crypto.scryptSync('fallback-dev-key', 'salt', 32)` silently encrypted production secrets with a publicly known static key.
  - Secrets without `:` delimiters were returned in plaintext.
  - Setting an invalid hex key threw uncaught internal runtime errors during cipher initialization.
- **Remediation Implemented:**
  1. Added `getEncryptionKey()` enforcing that when `WEBHOOK_ENCRYPTION_KEY` is supplied, it must strictly be a 64-character hexadecimal string (32 bytes).
  2. Preserved the fallback only for local/test environments and fail-closed on tampered ciphertexts.
- **Regression Tests:** Added `detects tampered ciphertext and fails to decrypt` and `validates 64-character hex string when WEBHOOK_ENCRYPTION_KEY is provided`.

---

### Finding 5: Medium — Command Injection Risk in Migration Runner (`scripts/migrate.ts`)

- **Severity:** Medium (CVSS: 6.7 / AV:L/AC:H/PR:L/UI:N/S:U/C:H/I:H/A:H)
- **Vulnerability Description:** In `scripts/migrate.ts`:
  ```ts
  execSync(`psql "${dbUrl}" -f "${fullPath}"`, { stdio: 'inherit' });
  ```
  `dbUrl` was interpolated into a shell string executed by `execSync`. If `DATABASE_URL` contained shell metacharacters (`" ; id ; "`), arbitrary shell execution occurred.
- **Remediation Implemented:**
  Replaced `execSync` with `execFileSync('psql', [dbUrl, '-f', fullPath], { stdio: 'inherit' })`, bypassing the shell interpreter completely.

---

### Finding 6: Low / API Abuse — Silent Filter Dropping & Unbounded Alert Queries in `/api/v1/alerts`

- **Severity:** Low (CVSS: 4.3 / AV:N/AC:L/PR:L/UI:N/S:U/C:L/I:N/A:L)
- **Vulnerability Description:**
  - `GET /api/v1/alerts` had no `LIMIT` clause and no pagination.
  - In `app/api/v1/alerts/route.ts`, filters were applied conditionally:
    ```ts
    if (status && ALLOWED_STATUSES.includes(status)) query = query.eq('status', status);
    ```
    An invalid or misspelled filter (`?status=OPENN` or `?severity=CRITICAL`) was silently ignored, returning alerts without that filter and exposing more workspace data than intended.
  - In `lib/rate-limit.ts`, the in-memory bucket map had no maximum capacity or eviction strategy, presenting a memory leak hazard under high distinct key loads.
- **Remediation Implemented:**
  1. In `app/api/v1/alerts/route.ts`, enforced `.limit(limit)` where `limit` defaults to 50 and is capped at 100.
  2. Replaced silent filter omissions with strict validation: any unrecognized `status` (outside `OPEN`, `ACKNOWLEDGED`, `RESOLVED`), unrecognized `severity` (outside `INFO`, `LOW`, `MEDIUM`, `HIGH`), malformed `workloadId` (non-UUID), or invalid `limit` returns HTTP 400 Bad Request with an explicit diagnostic message.
  3. In `lib/rate-limit.ts`, added TTL cleanup (1 hour) and a hard cap of 10,000 entries with LRU-style pruning when capacity is exceeded.
- **Regression Tests:** Added to `lib/__tests__/security-audit.test.ts`:
  - `allows initial burst up to maxTokens and denies excess requests`
  - `prunes expired entries and caps maximum stored bucket keys to prevent memory leaks`
  - `rejects invalid status filter with 400 Bad Request`
  - `rejects invalid severity filter with 400 Bad Request`
  - `rejects invalid workloadId parameter with 400 Bad Request`
  - `rejects invalid limit parameter with 400 Bad Request`
  - `accepts valid status and severity filters`

---

### Finding 7: Low — Missing Length Constraints on Workloads and Attribution Rules

- **Severity:** Low (CVSS: 3.7 / AV:N/AC:L/PR:L/UI:N/S:U/C:N/I:L/A:N)
- **Vulnerability Description:** `POST /api/v1/workloads` and `POST /api/v1/workloads/[id]/attribution-rules` did not enforce maximum string lengths on `name`, `description`, `provider`, `matchType`, or `matchValue`.
- **Remediation Implemented:**
  Enforced 255-character limits on `name`, `provider`, `matchType`, and `matchValue`, and a 2000-character limit on `description`.

---

### Finding 8: Data Integrity / Bug — CSV In-File Duplicate Metric Miscalculation and Rejected Row Inflation

- **Severity:** Low / Defect
- **Vulnerability Description:** In `app/api/v1/usage/import/route.ts`:
  1. In an earlier iteration, `duplicates: unique.length - fresh.length` omitted in-file duplicate rows.
  2. When updated to `parsed.eventRows.length - fresh.length`, subtracting from `eventRows` caused confusion because `eventRows` only contains rows that passed row validation. If rows were rejected during CSV validation, deriving duplicate counts without clear grounding in validated events risked count inflation.
- **Remediation Implemented:**
  Derived duplicates strictly from validated rows:
  ```ts
  const duplicates = Math.max(0, parsed.events.length - fresh.length);
  ```
  This guarantees that syntax-invalid or rejected rows cannot inflate duplicate counts, and reports clean, consistent metrics: `validated: parsed.events.length`, `accepted: imported`, `duplicates`, and `rejected: errors.length + failures.length`.
- **Regression Test:** Added `calculates duplicates from validated rows only without counting rejected rows` in `lib/__tests__/security-audit.test.ts`.

---

### Finding 9: Secret Hygiene — Live Remote Credentials in `.env.local`

- **Severity:** Medium (Operational Risk)
- **Vulnerability Description:**
  `.env.local` contained live remote Supabase credentials:
  - `NEXT_PUBLIC_SUPABASE_URL` (remote project URL)
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY` (live anon JWT)
  - `SUPABASE_SERVICE_ROLE_KEY` (live administrative service-role JWT)
  - `GEMINI_API_KEY` (live Google Gemini API key)
  While `.env.local` is present in `.gitignore`, committing or deploying this repository with `.env.local` present would leak administrative database and API credentials.
- **Remediation Recommendation:**
  1. Revoke and rotate the remote Supabase service-role key and Gemini API key immediately.
  2. For local testing, follow `PRODUCT_BOUNDARY.md` and use the local Supabase instance printed by `npx supabase status` (`http://127.0.0.1:54321`). Replaced `.env.local` with local preview credentials matching the isolated local Postgres instance.

---

### Finding 10: High / Availability — PostgreSQL Schema Migration Deadlock & Stale View Column Reference

- **Severity:** High (Availability & Deployment Integrity)
- **Vulnerability Description:**
  In `supabase/migrations/20261028000000_query_scalability.sql`:
  1. **Stale View Column Mapping:** The view `v_attributed_usage_events` was defined in `20260920000000_v0_phase5_attribution.sql` using `SELECT u.*`. In PostgreSQL, views freeze their column definitions at creation time and do not dynamically incorporate columns added later to `usage_events` (`is_unpriced`, `request_count`, etc.). When migration 14 created `aggregate_dashboard_summary` (`LANGUAGE sql`), the query referenced `usage.is_unpriced` on `v_attributed_usage_events`, aborting with:
     `ERROR: column usage.is_unpriced does not exist (SQLSTATE 42703)`
  2. **Incompatible Return Type Modification:** `aggregate_dashboard_trends` had its return column signature altered without `DROP FUNCTION IF EXISTS`, failing with:
     `ERROR: cannot change return type of existing function (SQLSTATE 42P13)`
- **Remediation Implemented:**
  1. Recreated `v_attributed_usage_events` with `DROP VIEW IF EXISTS ... CASCADE; CREATE VIEW ...` at the start of `20261028000000_query_scalability.sql` so all post-phase-5 columns are present.
  2. Added `DROP FUNCTION IF EXISTS aggregate_dashboard_trends(UUID, TIMESTAMPTZ, TIMESTAMPTZ);` prior to declaring the updated signature.
  - **Verification:** Clean `npx supabase start` applied all 17 migrations sequentially with 0 errors.

---

### Finding 11: Medium / DoS — Unscoped Native Filesystem Traversal Deadlock in Tailwind CSS v4

- **Severity:** Medium (Denial of Service / Compilation Stall)
- **Vulnerability Description:**
  In `app/globals.css`, the standard `@import "tailwindcss";` triggered Tailwind v4's Rust-based native `@tailwindcss/oxide` scanner to recursively crawl all filesystem directories from the repository root downward (`**/*`). On systems with extensive directory trees (such as `node_modules` with >50,000 files and `.next` build caches), this unconstrained traversal caused an indefinite synchronous I/O lock, stalling Next.js page compilation and hanging all incoming HTTP requests to dashboard pages.
- **Remediation Implemented:**
  Configured `app/globals.css` with `@import "tailwindcss" source(none);` and explicit `@source "../app"; @source "../components";` directives.
  - **Verification:** Reduced PostCSS/Tailwind compilation latency from an indefinite hang to **~44ms**, allowing instantaneous page hydration.

---

### Finding 12: Low / Tooling — Dev Compiler Thread Hang under Node.js 26

- **Severity:** Low (Developer Environment Reliability)
- **Vulnerability Description:**
  In `package.json`, `"dev": "next dev"` defaulted to Turbopack in Next.js 16. Under Node.js 26, Turbopack's native worker threads exhibited IPC deadlocks and `module.register()` deprecation stalls on page requests.
- **Remediation Implemented:**
  Aligned `"dev": "next dev --webpack"` in `package.json` with the existing production build script (`"build": "next build --webpack"`), ensuring consistent, stable Webpack compilation across all supported Node runtimes.

---

## 4. SQL Injection & Database Query Analysis

### 4.1 Stored Procedures & Functions
All database procedures (`aggregate_usage_page`, `aggregate_dashboard_summary`, `aggregate_dashboard_trends_v2`, `aggregate_audit_window_v2`, `aggregate_outcome_analytics`, `upsert_alert`) were audited:
- **No Dynamic SQL Concatenation:** None of the functions use `EXECUTE '... ' || user_input`.
- **Explicit Parameter Types:** All inputs are strictly typed (`UUID`, `TIMESTAMPTZ`, `TEXT`, `INTEGER`).
- **Function Search Path:** Stored procedures specify `SET search_path = public`, preventing search path hijacking attacks.
- **Execution Rights:** Revoked from `PUBLIC`, `anon`, and `authenticated` in migration `20261031000000_single_user_local_preview_boundary.sql`.

### 4.2 Query Builder Auditing
All application routes use the Supabase PostgREST client:
- Parameters passed to `.eq()`, `.in()`, and `.rpc()` are parameterized by PostgREST and sent as bind variables to PostgreSQL.
- Sorting is strictly hardcoded: `.order('created_at', { ascending: false })` or `.order('timestamp', { ascending: false })`. No user-controlled sort column exists.
- Pagination is validated using safe integer regex `/^\d+$/` and bounded between 1 and 100 for `limit`.

---

## 5. IDOR & BOLA Verification

| Resource | Access Method | Server-Side Org Check | IDOR Possible? |
|---|---|---|---|
| **Workloads** | `GET /api/v1/workloads/[id]` | `.eq('id', id).eq('organization_id', orgId)` | **No** (returns 404 if in another org) |
| **Workloads** | `PATCH /api/v1/workloads/[id]` | `.eq('id', id).eq('organization_id', orgId)` | **No** (returns 404 if in another org) |
| **Workloads** | `DELETE /api/v1/workloads/[id]` | `.eq('id', id).eq('organization_id', orgId)` | **No** (scoped delete) |
| **Attribution Rules** | `GET /api/v1/workloads/[id]/attribution-rules` | Validates workload belongs to `orgId`, then queries `.eq('workload_id', id).eq('organization_id', orgId)` | **No** |
| **Attribution Rules** | `POST /api/v1/workloads/[id]/attribution-rules` | Validates workload belongs to `orgId` | **No** |
| **Attribution Rules** | `DELETE /api/v1/workloads/[id]/attribution-rules/[ruleId]` | Validates workload belongs to `orgId`, then deletes `.eq('id', ruleId).eq('organization_id', orgId)` | **No** |
| **Outcome Events** | `POST /api/v1/outcomes` | Validates `workload_id` belongs to `orgId` before inserting | **No** |
| **Audit Findings** | `GET /api/v1/audits` | `.eq('organization_id', orgId)` | **No** |
| **Alerts** | `POST /api/v1/alerts/[id]/resolve` | `.eq('id', id).eq('organization_id', orgId)` | **No** |
| **Dashboard Metrics** | `GET /api/v1/dashboard/summary` | Passed `p_organization_id: orgId` to PostgreSQL RPC | **No** |

Every resource is authorized server-side by the authenticated organization ID. However, because `getAuthOrgId` in local mode defaults to `STACKAUDIT_WORKSPACE_ORG_ID`, any unauthenticated local caller acts as that organization's owner.

---

## 6. Regression Testing & Test Execution

A comprehensive test suite was executed across all components:

```sh
npm test
```

### Execution Results:
```
 Test Files  24 passed (24)
      Tests  162 passed (162)
   Duration  3.29s
```

### Dedicated Security Test Suite (`lib/__tests__/security-audit.test.ts` - 35 Tests):
1. **SSRF & IP Validation (9 tests):**
   - Blocks private IPv4 ranges (10.x, 127.x, 169.254.x, 192.168.x, 172.16-31.x)
   - Allows benign public IPv4 addresses (8.8.8.8, 1.1.1.1, 93.184.216.34)
   - Blocks private, loopback, ULA, and link-local IPv6 ranges (`::1`, `fe80::/10`, `fc00::/7`)
   - Blocks IPv4-mapped and IPv4-compatible IPv6 addresses in dotted decimal (`::ffff:127.0.0.1`, `::127.0.0.1`)
   - Blocks IPv4-mapped and IPv4-compatible IPv6 addresses in hexadecimal format (`::ffff:7f00:1`, `::ffff:a00:1`, `::7f00:1`)
   - Rejects non-HTTPS webhook URLs
   - Rejects raw IP hostnames targeting private/internal endpoints
   - Validates dual-stack DNS resolutions and blocks if either IPv4 or IPv6 is internal
   - Pins validated IP address to prevent DNS rebinding TOCTOU
2. **Authentication and Remote Boundary (5 tests):**
   - Allows unauthenticated requests in local mode as the single operator
   - Strictly rejects unauthenticated requests when `STACKAUDIT_DATABASE_MODE=remote`
   - Rejects malformed Authorization headers
   - Rejects valid bearer identities assigned to another organization (IDOR)
   - Prevents callers from overriding organization via query string or body
3. **Webhook Crypto & Secret Key Hygiene (3 tests):**
   - Encrypts and decrypts secrets with AES-256-GCM
   - Detects tampered ciphertext and fails to decrypt
   - Validates 64-character hex string when `WEBHOOK_ENCRYPTION_KEY` is provided
4. **Rate Limiting & DoS Protection (2 tests):**
   - Allows initial burst up to maxTokens and denies excess requests
   - Prunes expired entries and caps maximum stored bucket keys to prevent memory leaks
5. **Timing Attack Protection on Internal Cron (1 test):**
   - Performs constant-time secret comparison via `timingSafeEqual`
6. **Cross-Organization IDOR & Resource Authorization (4 tests):**
   - Strictly blocks reading another organization's workload (IDOR prevention)
   - Strictly blocks modifying another organization's workload
   - Strictly blocks listing attribution rules for another organization's workload
   - Strictly blocks emitting outcomes for another organization's workload
7. **SQL Injection Parameterization & Filter Boundaries (5 tests):**
   - Neutralizes SQL injection payloads in CSV usage import fields
   - Parses CSV formula injection triggers safely as literal text
   - Rejects SQL injection payloads in UUID filter validation
   - Rejects SQL injection strings in numeric pagination fields
   - Strictly allowlists alert status and severity query filters
8. **Alert Filter Validation & Bad Request Handling (5 tests):**
   - Rejects invalid status filter with 400 Bad Request
   - Rejects invalid severity filter with 400 Bad Request
   - Rejects invalid workloadId parameter with 400 Bad Request
   - Rejects invalid limit parameter with 400 Bad Request
   - Accepts valid status and severity filters
9. **Usage Import Accurate Duplicate Accounting (1 test):**
   - Calculates duplicates from validated rows only without counting rejected rows

---

## 7. Remaining Limitations & Multi-Tenant Roadmap

Before StackAudit can be offered as a shared-tenant or hosted production service, the following architectural transformations are required:

| Component | Current V0 State | Required for Hosted Multi-Tenancy |
|---|---|---|
| **Database Identity** | Single `service_role` key bypassing RLS | Least-privilege `authenticated` database role with user JWT context (`auth.uid()`, `auth.jwt()`) |
| **Row-Level Security** | Tables have RLS enabled but 0 policies (service role bypasses) | Declarative RLS policies on all tables (`WHERE organization_id = (SELECT org_id FROM memberships WHERE user_id = auth.uid())`) |
| **User Authentication** | Single-workspace fallback without login | Real session authentication (Supabase Auth / NextAuth / OAuth2 / OIDC) with session cookies and CSRF protection |
| **Organization Membership** | Implicit workspace organization UUID | Multi-user membership table with explicit roles (`owner`, `admin`, `member`, `viewer`) |
| **Cross-Origin Protection** | No middleware or Origin validation | CSRF tokens or strict `SameSite=Lax`/`Strict` cookies and `Sec-Fetch-Site` header checks |
| **Rate Limiting** | Single in-memory token bucket on 1 endpoint | Distributed rate limiter (Redis / Upstash) across all endpoints with per-tenant quotas |
| **Webhook Egress Protection** | Node.js socket IP pinning & DNS check | Dedicated egress proxy / VPC firewall with destination IP range enforcement |
| **Secret Storage** | AES-256-GCM with environment key | Hardware security module (AWS KMS / GCP Cloud KMS / Vault) with automatic rotation |

---

## 8. Summary Table of Addressed Vulnerabilities

| Vulnerability ID | Category | Component | Status | Verification |
|---|---|---|---|---|
| **SEC-01** | Auth Bypass | `lib/auth.ts` | **FIXED** | Rejects unauthenticated requests in remote mode with 401 |
| **SEC-02** | SSRF & Rebinding | `core/monitoring/.../webhook.ts` | **FIXED** | IPv4/IPv6 byte normalization, dual-stack check, and socket IP pinning |
| **SEC-03** | Timing Attack | `api/v1/internal/...` | **FIXED** | Constant-time `crypto.timingSafeEqual` for `CRON_SECRET` |
| **SEC-04** | Cryptography | `lib/crypto.ts` | **FIXED** | Enforced 32-byte hex validation; hardened against ciphertext tampering |
| **SEC-05** | Command Injection | `scripts/migrate.ts` | **FIXED** | Replaced `execSync` shell string with `execFileSync` argument array |
| **SEC-06** | API Abuse | `lib/rate-limit.ts` | **FIXED** | Bounded in-memory buckets (max 10,000 entries) with TTL expiration |
| **SEC-07** | Query Boundary & DoS | `app/api/v1/alerts` | **FIXED** | Bounded queries (`limit: 100`) and 400 Bad Request on invalid filters |
| **SEC-08** | Input Validation | `workloads` & `attribution-rules` | **FIXED** | Enforced 255/2000 character length constraints |
| **SEC-09** | Data Integrity | `app/api/v1/usage/import` | **FIXED** | Accurate duplicate accounting grounded strictly in validated rows |
| **SEC-10** | Schema Deadlock | `supabase/migrations/20261028000000...` | **FIXED** | View recreation and drop function signature safety |
| **SEC-11** | DoS / Hang | `app/globals.css` | **FIXED** | Scoped Tailwind v4 source paths to prevent infinite traversal |
| **SEC-12** | Runtime Hang | `package.json` | **FIXED** | Standardized `--webpack` dev compiler under Node 26 |
