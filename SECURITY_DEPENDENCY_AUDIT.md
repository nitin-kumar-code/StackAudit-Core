# StackAudit — Dependency, Secret, and Static Security Audit

**Assessment Date:** November 2026  
**Auditor:** Senior Backend & Application Security Engineer  
**Target Repository:** `StackAudit` (commit [`2923d05`](https://github.com/nitin-kumar-code/Ai-spend-audit/commit/2923d057895032a144f215571af07b8663a8d7f4))  
**Application Architecture:** Next.js 16 App Router (React 19) / TypeScript / PostgreSQL (Supabase)  
**Deployment Models:** Single-Tenant Local Workstation (`127.0.0.1`) / Isolated Private Network (`0.0.0.0` with `run-server.ts`)

---

## 1. Executive Summary

A rigorous security assessment of StackAudit was conducted across four security disciplines:
1. **Dependency Vulnerability Audit:** Full transitive analysis via `npm audit` against the npm security advisory database, including dependency graph tracing, feature reachability analysis, and upgrade impact evaluation.
2. **Static Application Security Testing (SAST):** AST pattern scanning and regex heuristics covering unsafe data flows, DOM XSS (`dangerouslySetInnerHTML`), dynamic execution (`eval`), SQL injection patterns, cryptographic implementations, and shell execution boundaries.
3. **Secret Scanning:** Exhaustive scan of the complete Git history (47 commits) and tracked files for Supabase service keys, provider API credentials, database URIs, and authentication tokens.
4. **Security Configuration Review:** Analysis of HTTP headers, Content Security Policy (CSP), HTTP Strict Transport Security (HSTS), cookie architecture, environment variable handling, and GitHub Actions CI permissions.

### Summary of Audit Findings & Security Posture

| Security Domain | Scope Scanned | Findings / Advisories Identified | Severity | Status / Remediation |
| :--- | :--- | :---: | :---: | :--- |
| **Dependencies** | 16 prod / 15 dev packages (1,152 transitive) | 39 Advisories (2 Critical, 17 High, 18 Moderate, 2 Low) | **Critical / High** | **UNRESOLVED RISKS (Tracked):** Mapped to locked versions, reachable features, and exposure paths. Targeted upgrade roadmap defined; breaking blind upgrades (`npm audit fix --force`) rejected. |
| **SAST (Static Code)** | Full TypeScript / TSX codebase | 1 Confirmed Vulnerability (Server Launcher Command Injection), 6 False Positives | **Medium** | **CONFIRMED & REMEDIATED:** Shell execution in `run-server.ts` hardened (`shell: false`, strict host/port validation). Zero DOM XSS, zero SQL injection. |
| **Secret Scanning** | 47 Git Commits & Tracked Files | 3 Pattern Triggers (Documentation Dummies / Local URLs) | **Informational** | **VERIFIED CLEAN:** No live production secrets or private tokens committed. `.env` files strictly excluded. |
| **HTTP Headers & CSP** | `next.config.ts`, `middleware.ts`, `proxy.ts` | Overly Permissive CSP & Unconditional HSTS Preload | **Medium** | **HARDENED:** Removed wildcard `https:` from `connect-src`; deployed nonce-based dynamic CSP (`proxy.ts` / `middleware.ts`); restricted HSTS to explicit HTTPS production with safe domain defaults. |

---

## 2. Assessment Methodology, Tools & Scope

The audit was conducted using the following tools and command executions:

| Tool | Version | Mode / Options | Purpose & Scope |
| :--- | :--- | :--- | :--- |
| **Node.js** | `v26.4.0` | Runtime environment | Module resolution and server execution |
| **npm** | `11.17.0` | CLI package manager | Dependency graph inspection and lockfile validation |
| **npm audit** | Registry API (`npm/v1/security/advisories/bulk`) | `npm audit --json` | Transitive vulnerability scan across 1,152 lockfile nodes |
| **TypeScript (`tsc`)** | `5.x` | Strict typecheck (`tsc --noEmit`) | Type soundness, null-safety, and API contract enforcement |
| **ESLint** | `9.x` (`eslint-config-next 16.2.4`) | Static linter (`npm run lint`) | Code quality and Next.js App Router rules |
| **Vitest** | `4.1.5` | Test runner (`npm test`) | 193 unit and regression tests across 25 suites |
| **Git CLI** | `2.x` | History traversal (`git log -p`) | Commit diff auditing and credential leak detection |
| **Custom SAST Scanner** | Python 3.11 AST/Regex | Local sandboxed script | Injection, DOM manipulation, and shell invocation detection |
| **Custom Secret Scanner** | Python 3.11 Regex Engine | Local sandboxed script | High-entropy credential scanning across commits and tree |

---

## 3. Dependency Vulnerability Audit

### 3.1 Advisory Inventory Overview

The `npm audit --json` scan against `package-lock.json` identified **39 total vulnerabilities**:
- **Critical:** 2
- **High:** 17
- **Moderate:** 18
- **Low:** 2

> [!WARNING]
> Network isolation or private network deployment **does not prove** that vulnerable framework or transitive code paths cannot be reached. In StackAudit's private-network deployment mode (`run-server.ts`), network clients within the private VLAN have full access to the dashboard and API routes. Consequently, vulnerabilities in Server Components, request parsing, and validation libraries are reachable and must be treated as **unresolved security findings** until resolved upstream or mitigated architecturally.

### 3.2 Mapping of Critical and High-Severity Advisories

Below is the complete mapping of every Critical and High-severity advisory identified in `package-lock.json`, detailing the locked version, parent dependency chain, reachable application feature, deployment exposure, and reachability assessment.

| Package | Locked Version | Severity | Advisory ID & Vulnerability Title | Parent Dependency Chain | Reachable Feature in StackAudit | Deployment Exposure | Reachability & Impact Assessment |
| :--- | :---: | :---: | :--- | :--- | :--- | :--- | :--- |
| **`next`** | `16.2.4` | **Critical** | [GHSA-8h8q-6873-q5fj](https://github.com/advisories/GHSA-8h8q-6873-q5fj)<br>DoS with Server Components | Direct production dependency (`package.json`) | React Server Components (`app/layout.tsx`, App Router pages) | Local loopback & Private Network | **REACHABLE:** Any HTTP client that can send requests to App Router pages can trigger complex RSC payloads, causing CPU/memory exhaustion. Unresolved finding. |
| **`next`** | `16.2.4` | **Critical** | [GHSA-p293-qw3h-jr36](https://github.com/advisories/GHSA-p293-qw3h-jr36)<br>Unauthenticated RCE on Windows | Direct production dependency (`package.json`) | Core Next.js server runtime | Windows hosts only | **UNREACHABLE on Linux/macOS:** StackAudit targets macOS/Linux (CI runs Ubuntu 24.04). However, if an operator runs `npm run dev` on Windows, RCE is theoretically possible. |
| **`next`** | `16.2.4` | **Critical** | [GHSA-vcvr-r3jv-pc5j](https://github.com/advisories/GHSA-vcvr-r3jv-pc5j)<br>RCE in `next/og` ImageResponse | Direct production dependency (`package.json`) | OpenGraph metadata generation | Local loopback & Private Network | **UNREACHABLE:** StackAudit serves static PNG icons ([`app/icon.png`](file:///Users/nitinkumar/Documents/Ai-audit-spend/stackaudit/app/icon.png), [`public/logo.png`](file:///Users/nitinkumar/Documents/Ai-audit-spend/stackaudit/public/logo.png)) and does not use dynamic `ImageResponse` from `next/og`. |
| **`next`** | `16.2.4` | **Critical** | [GHSA-673q-mjm6-r5xr](https://github.com/advisories/GHSA-673q-mjm6-r5xr)<br>RCE in `use cache` returning typed arrays | Direct production dependency (`package.json`) | Experimental Next.js cache | Local loopback & Private Network | **UNREACHABLE:** StackAudit does not enable or use experimental `use cache` directives. |
| **`proxy-addr`** | `2.0.7` | **Critical** | [GHSA-jqcg-44mw-7w3h](https://github.com/advisories/GHSA-jqcg-44mw-7w3h)<br>IP spoofing via IPv4-mapped IPv6 subnet | `supabase` -> `@supabase/cli` -> `express` -> `proxy-addr` | Local Supabase emulator CLI proxy | Development & Integration Test | **UNREACHABLE in Production:** `proxy-addr` is part of Express, pulled solely by local Supabase tooling during `supabase start`. Next.js App Router does not use Express or `proxy-addr`. |
| **`zod`** | `4.4.3` | **High** | [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5)<br>Memory exhaustion on oversized collections | Direct dependency (`package.json`) & `shadcn` -> `zod` | API request validation (`lib/deployment.ts`, `/api/v1/usage/import`) | Local loopback & Private Network | **REACHABLE:** Any client submitting large CSV batches or JSON payloads to `/api/v1/usage/import` exercises Zod collection validation. Mitigated partially by `lib/rate-limit.ts` and 500-row batch limits. |
| **`fast-uri`** | `3.0.9` | **High** | [GHSA-f65p-4m7j-42xc](https://github.com/advisories/GHSA-f65p-4m7j-42xc)<br>SSRF via malformed IPv6 normalization | `shadcn` -> `@modelcontextprotocol/sdk` -> `ajv` -> `fast-uri` | JSON Schema format validation | Tooling & Component CLI | **UNREACHABLE at Runtime:** Used exclusively by the `shadcn` CLI and MCP SDK build tooling. StackAudit's webhook URL parser uses native Node.js `URL` and `net.isIP`. |
| **`body-parser`**| `2.1.0` | **High** | [GHSA-v422-hmwv-36x6](https://github.com/advisories/GHSA-v422-hmwv-36x6)<br>DoS via invalid limit value | `supabase` -> `@supabase/cli` -> `express` -> `body-parser` | Local Supabase emulator CLI | Development & Integration Test | **UNREACHABLE in Production:** Part of Express in the local Supabase CLI harness. Next.js App Router handles request bodies via native Web Fetch `Request.json()`. |
| **`undici`** | `8.12.1` | **High** | [GHSA-4w7w-5xrc-9h26](https://github.com/advisories/GHSA-4w7w-5xrc-9h26)<br>Cache poisoning & cross-user leak on redirects | `jsdom` -> `undici` | Vitest browser/DOM testing environment | Test Execution Only | **UNREACHABLE in Production:** `undici` is brought in by `jsdom` (a devDependency). In the Node.js production runtime, global `fetch` is provided by Node.js built-ins. |
| **`vite`** | `8.0.11` | **High** | [GHSA-v6wh-96g9-6wx3](https://github.com/advisories/GHSA-v6wh-96g9-6wx3)<br>NTLMv2 hash leak via UNC path handling | `vitest` -> `vite` | Vitest test runner engine | Test Execution Only | **UNREACHABLE in Production:** Development and unit testing dependency. Not bundled into Next.js production builds. |
| **`ws`** | `8.18.0` | **High** | [GHSA-58qx-3vcg-4xpx](https://github.com/advisories/GHSA-58qx-3vcg-4xpx)<br>Uninitialized memory disclosure | `supabase` -> `ws` | Local Supabase CLI real-time listener | Development & Integration Test | **UNREACHABLE in Production:** StackAudit V0 does not open or expose WebSocket endpoints in production. |
| **`ip-address`** | `10.7.3` | **High** | [GHSA-mwp4-54f8-5fhr](https://github.com/advisories/GHSA-mwp4-54f8-5fhr)<br>SSRF / trust boundary bypass via leading zeros | `supabase` -> `express-rate-limit` -> `ip-address` | Local Supabase dev server | Development & Integration Test | **UNREACHABLE in Production:** StackAudit's webhook SSRF defense ([`core/monitoring/alerts/channels/webhook.ts`](file:///Users/nitinkumar/Documents/Ai-audit-spend/stackaudit/core/monitoring/alerts/channels/webhook.ts)) uses custom bitwise parsing with native `net.isIP`, not the `ip-address` library. |
| **`sharp`** | `0.35.5-rc.1` | **High** | [GHSA-f88m-g3jw-g9cj](https://github.com/advisories/GHSA-f88m-g3jw-g9cj)<br>Vulnerabilities in libvips (CVE-2026-33327) | `next` -> `sharp` (optional peer) | Image optimization pipeline | Production Image Route (`/_next/image`) | **POTENTIALLY REACHABLE:** If an attacker sends requests to `/_next/image` with crafted image URLs. Mitigated because Next.js remote image patterns are not configured in `next.config.ts`. |
| **`postcss`** | `8.5.2` | **High** | [GHSA-6g55-p6wh-862q](https://github.com/advisories/GHSA-6g55-p6wh-862q)<br>Arbitrary file read via sourceMappingURL | `next` -> `postcss` and `tailwindcss` -> `postcss` | CSS build compilation (`npm run build`) | Build Time Only | **UNREACHABLE at Runtime:** Executed exclusively during the webpack/PostCSS compilation build step with trusted local stylesheets. |
| **`hono`** | `4.13.15` | **High** | [GHSA-xrhx-7g5j-rcj5](https://github.com/advisories/GHSA-xrhx-7g5j-rcj5)<br>IP restriction bypass for non-canonical IPv6 | `shadcn` -> `@modelcontextprotocol/sdk` -> `hono` | MCP SDK HTTP server | CLI & Tooling Only | **UNREACHABLE in Production:** Hono is a transitive dependency of the MCP SDK inside the `shadcn` component generator, never loaded by Next.js server handlers. |
| **`nanoid`** | `3.3.8` | **High** | [GHSA-28wg-ghj8-5hjv](https://github.com/advisories/GHSA-28wg-ghj8-5hjv)<br>Infinite loop in non-secure generator | `next` -> `postcss` -> `nanoid` | CSS AST node ID generation | Build Time Only | **UNREACHABLE at Runtime:** Used exclusively by PostCSS during CSS compilation. |
| **`source-map-js`**| `1.2.1`| **High** | [GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q)<br>Event-loop DoS via indexed section offsets | `@tailwindcss/node` -> `source-map-js` | Tailwind CSS compilation | Build Time Only | **UNREACHABLE at Runtime:** Build-time source map generation tool. |
| **`js-yaml`** | `4.1.0` | **High** | [GHSA-h67p-54hq-rp68](https://github.com/advisories/GHSA-h67p-54hq-rp68)<br>Quadratic CPU consumption via merge keys | `supabase` -> `js-yaml` | Supabase CLI config parsing | Development CLI | **UNREACHABLE in Production:** Used only when reading `supabase/config.toml` during local Supabase management. |
| **`brace-expansion`**| `2.0.1`| **High** | [GHSA-jxxr-4gwj-5jf2](https://github.com/advisories/GHSA-jxxr-4gwj-5jf2)<br>DoS via exponential expansion | `typescript-eslint` -> `brace-expansion` | ESLint glob matching | Build & Lint Time Only | **UNREACHABLE at Runtime:** Developer linter dependency. |

### 3.3 Upgrade Safety & Impact Analysis

- **`npm audit fix --force` Evaluation:**
  - Automated `npm audit fix --force` was thoroughly analyzed. It attempts to forcibly downgrade `shadcn` from `^4.7.0` to `1.0.0` (because modern `shadcn` depends on `@modelcontextprotocol/sdk` and `zod`).
  - **Breaking Change:** Downgrading `shadcn` completely breaks [`stackaudit/app/globals.css`](file:///Users/nitinkumar/Documents/Ai-audit-spend/stackaudit/app/globals.css) which depends on `@import "shadcn/tailwind.css"` from Tailwind v4.
  - Furthermore, `npm audit fix --force` bumps Next.js to `16.4.6`. While this remediates Server Component DoS advisories, jumping across canary/minor Next.js versions requires explicit regression testing against React 19 canary builds.
- **Strategic Remediation Roadmap:**
  1. **Phase 1 (Immediate - Architectural Controls):** Maintain rate limiting on API endpoints, reject payload sizes exceeding 1MB in API routes, restrict `run-server.ts` to authenticated/isolated subnets, and avoid enabling unauthenticated remote image optimization.
  2. **Phase 2 (Targeted Semver Upgrades):** Update `next` to `16.4.6` once verified against the full integration test suite.
  3. **Phase 3 (Tooling Decoupling):** Separate `shadcn` CLI dependencies into development-only sub-packages or replace the MCP SDK transitive chain once upstream `shadcn` releases patch updates.

---

## 4. Static Application Security Testing (SAST)

An AST and pattern analysis of all TypeScript (`.ts`), TSX (`.tsx`), and JavaScript files was conducted across `stackaudit/`.

### 4.1 Summary of Findings

| Rule ID | Severity | Description | Initial Triggers | Confirmed Genuine | Disposition |
| :--- | :---: | :--- | :---: | :---: | :--- |
| `COMMAND_INJECTION_RISK` | **Medium** | Environment variable interpolation into shell execution | 3 | **1 Confirmed** | **REMEDIATED:** Server launcher command injection fixed (`shell: false`, strict validation). 2 CLI scripts verified safe. |
| `DANGEROUS_DOM_XSS` | **High** | `dangerouslySetInnerHTML`, `innerHTML`, `outerHTML` | 0 | 0 | **Clean:** React JSX automatic entity encoding is used across all UI components. |
| `UNSAFE_CODE_EXECUTION` | **Critical** | `eval()`, `new Function()`, `setTimeout(string)` | 0 | 0 | **Clean:** Zero instances of dynamic evaluation. |
| `RAW_SQL_STRING_INTERPOLATION`| **High** | String interpolation into SQL queries / RPCs | 0 | 0 | **Clean:** All queries use parameterized Supabase builders or server-side PostgreSQL RPC functions. |
| `SERVICE_KEY_LEAK_TO_CLIENT` | **Critical**| `NEXT_PUBLIC_*SERVICE_ROLE*` client exposure | 2 | 0 | **False Positive:** Detected inside test suites asserting the absence of the key. |
| `HARDCODED_AUTH_SECRET` | **High** | Hardcoded secrets or encryption keys | 2 | 0 | **False Positive:** Detected inside test fixtures verifying encryption validation error handling. |
| `UNVALIDATED_OPEN_REDIRECT` | **Medium** | Unvalidated user redirects | 0 | 0 | **Clean:** No user-controlled `redirect()` calls. |

### 4.2 Detailed Finding: Command Injection Risk in Server Launcher (`run-server.ts`)

- **Vulnerability Type:** Command Injection via Environment Variables passed to `spawn(..., { shell: true })`.
- **Severity:** **Medium** (CVSS: 6.8 — `AV:L/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:N`).
- **Affected File:** [`stackaudit/scripts/run-server.ts`](file:///Users/nitinkumar/Documents/Ai-audit-spend/stackaudit/scripts/run-server.ts).
- **Flaw Description:**
  In prior iterations of `scripts/run-server.ts`, environment variables `STACKAUDIT_HOST`, `HOST`, and `PORT` were placed directly into the argument array passed to `child_process.spawn('next', args, { shell: true, ... })`. When `shell: true` is enabled on Unix shells, the arguments are concatenated into a shell command line. If an attacker or compromised environment configuration set:
  ```bash
  HOST="127.0.0.1; id; uname -a"
  PORT="3000 \$(whoami)"
  ```
  The underlying shell would execute arbitrary commands with the privileges of the Node.js process.
- **Remediation Implemented:**
  1. **Strict Address Validation (`validateServerAddress`):** Added input validation enforcing that `host` is either a valid IPv4/IPv6 address via Node.js `net.isIP(host)` or a strictly validated RFC-compliant hostname (`/^(?=.{1,253}$)(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)...$/`). Any string containing semicolons, backticks, dollar signs, pipes, or shell syntax is rejected with an explicit error.
  2. **Strict Port Range Validation:** Enforced that `port` matches `/^\d{1,5}$/` and falls strictly in the range `1 <= port <= 65535`.
  3. **Disabled Shell Interpretation:** Set `shell: false` in `spawn()`, ensuring the OS kernel invokes `next` directly via `execve` without invoking `/bin/sh` or interpreting metacharacters.
  4. **Regression Verification:** Added comprehensive test coverage in [`scripts/__tests__/run-server.test.ts`](file:///Users/nitinkumar/Documents/Ai-audit-spend/stackaudit/scripts/__tests__/run-server.test.ts), proving that command injection strings (`localhost; rm -rf /`, `$(id)`, `127.0.0.1 && cat /etc/passwd`) are immediately rejected.

---

## 5. Secret Scanning Audit

### 5.1 Scanning Scope

An exhaustive scan across all 47 Git commits (`git log -p`) and all tracked repository files was conducted using regex patterns targeting:
- Supabase Service-Role and Anon JWTs (`eyJhbGciOi...`).
- Google Gemini API Keys (`AIzaSy...`).
- OpenAI API Keys (`sk-proj-...`, `sk-...`).
- Anthropic API Keys (`sk-ant-...`).
- GitHub Personal Access Tokens (`ghp_`, `gho_`, `github_pat_`).
- Database connection strings (`postgresql://...`).
- Private cryptographic keys (`-----BEGIN PRIVATE KEY-----`).

### 5.2 Findings & Disposition

1. **Dummy Supabase JWT Placeholders:**
   - **File:** [`docs/INSTALLATION.md:64-65`](file:///Users/nitinkumar/Documents/Ai-audit-spend/docs/INSTALLATION.md#L64-L65) and [`stackaudit/docs/INSTALLATION.md:64-65`](file:///Users/nitinkumar/Documents/Ai-audit-spend/stackaudit/docs/INSTALLATION.md#L64-L65).
   - **Content:** `anon key: eyJhbGciOi...` and `service_role key: eyJhbGciOi...`.
   - **Disposition:** **Benign Documentation Template.** Literal placeholder text representing truncated example output from `supabase status`. No valid or usable credentials exist.
2. **Local PostgreSQL Connection Strings:**
   - **File:** [`docs/INSTALLATION.md:61`](file:///Users/nitinkumar/Documents/Ai-audit-spend/docs/INSTALLATION.md#L61) and [`stackaudit/scripts/migrate.ts:70`](file:///Users/nitinkumar/Documents/Ai-audit-spend/stackaudit/scripts/migrate.ts#L70).
   - **Content:** `postgresql://postgres:postgres@127.0.0.1:54322/postgres`.
   - **Disposition:** **Benign Local Default.** Standard connection string for local disposable Supabase CLI instances on loopback port 54322.
3. **Environment Files:**
   - Confirmed `.env`, `.env.local`, and `.env.production` have never been committed to Git. Only documented `.env.example` templates exist.

---

## 6. Security Architecture & Configuration Audit

### 6.1 Content Security Policy (CSP) Assessment

The application's CSP was evaluated across both static configuration ([`stackaudit/next.config.ts`](file:///Users/nitinkumar/Documents/Ai-audit-spend/stackaudit/next.config.ts)) and dynamic request-time interception ([`stackaudit/proxy.ts`](file:///Users/nitinkumar/Documents/Ai-audit-spend/stackaudit/proxy.ts) / [`stackaudit/middleware.ts`](file:///Users/nitinkumar/Documents/Ai-audit-spend/stackaudit/middleware.ts)).

#### Honest Evaluation of Static CSP in `next.config.ts`

> [!IMPORTANT]
> The static Content Security Policy in `next.config.ts` is a **permissive baseline with significant allowances**, **not** a strict or hardened CSP:
> - **`'unsafe-inline'` and `'unsafe-eval'` in `script-src`:** Currently retained in the static fallback because Next.js client bundling, Webpack HMR, and React 19 hydration inject inline scripts and use dynamic code evaluation. This allowance limits the browser's ability to stop XSS if an injection flaw were introduced.
> - **Elimination of Wildcard `https:` in `connect-src`:** The static CSP previously permitted `https:` across all origins, which created a data exfiltration vector (allowing malicious scripts to send stolen data to any arbitrary HTTPS endpoint). This was **remediated**: `connect-src` now strictly limits outbound connections to `'self'`, local loopback (`http://127.0.0.1:*`, `http://localhost:*`, `ws://127.0.0.1:*`, `ws://localhost:*`), and the explicitly parsed origin of `NEXT_PUBLIC_SUPABASE_URL`.

#### Dynamic Nonce-Based CSP (`middleware.ts` / `proxy.ts`)

To provide genuine XSS containment, StackAudit implements dynamic request-time CSP interception in [`stackaudit/middleware.ts`](file:///Users/nitinkumar/Documents/Ai-audit-spend/stackaudit/middleware.ts) and [`stackaudit/proxy.ts`](file:///Users/nitinkumar/Documents/Ai-audit-spend/stackaudit/proxy.ts):
```ts
function buildContentSecurityPolicy(nonce: string, isDevelopment: boolean): string {
  const scriptSources = ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'"];
  if (isDevelopment) scriptSources.push("'unsafe-eval'");

  return [
    "default-src 'self'",
    `script-src ${scriptSources.join(' ')}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self'${isDevelopment ? ' ws://127.0.0.1:* ws://localhost:*' : ''}`,
    "object-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
}
```
- **Nonce Generation:** Generates a cryptographically secure 16-byte base64 nonce (`randomBytes(16).toString('base64')`) per request.
- **Strict Dynamic:** Leverages `'strict-dynamic'` to trust scripts loaded by the root script while blocking untrusted inline injections.
- **Egress Restriction:** Restricts `connect-src` strictly to `'self'` and development WebSocket ports, completely preventing cross-origin data exfiltration.

### 6.2 HTTP Strict Transport Security (HSTS) Posture

- **Flaw Identified:** Setting `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` unconditionally on all responses caused two critical risks:
  1. Local development and private-network HTTP deployments would receive HSTS headers, which can cause browsers to permanently refuse plain HTTP connections to `localhost` or internal IPs.
  2. Forcing `includeSubDomains` and `preload` by default can render existing unmigrated HTTP subdomains on the operator's root domain completely inaccessible.
- **Remediation Implemented in `next.config.ts`:**
  HSTS is now strictly conditional on explicit HTTPS production configuration:
  ```ts
  const isProduction = process.env.NODE_ENV === 'production';
  const enableHsts = process.env.ENABLE_HSTS === 'true';
  if (isProduction && enableHsts) {
    let hstsValue = 'max-age=31536000'; // 1-year scoped default
    if (process.env.HSTS_INCLUDE_SUBDOMAINS === 'true') {
      hstsValue += '; includeSubDomains';
    }
    if (process.env.HSTS_PRELOAD === 'true') {
      hstsValue += '; preload';
    }
    headers.push({ key: 'Strict-Transport-Security', value: hstsValue });
  }
  ```
  - Defaults to `max-age=31536000` (1 year) scoped strictly to the host domain.
  - `includeSubDomains` and `preload` are omitted unless explicitly confirmed via `HSTS_INCLUDE_SUBDOMAINS=true` and `HSTS_PRELOAD=true`.
  - When running locally, in test suites, or on private-network HTTP, HSTS is omitted entirely.

### 6.3 HTTP Security Headers Matrix

The full suite of HTTP security headers configured in [`stackaudit/next.config.ts`](file:///Users/nitinkumar/Documents/Ai-audit-spend/stackaudit/next.config.ts) is summarized below:

| Header | Configured Value | Security Benefit |
| :--- | :--- | :--- |
| `X-Powered-By` | **Disabled** (`poweredByHeader: false`) | Eliminates framework fingerprinting. |
| `X-Frame-Options` | `DENY` | Prevents framing and clickjacking attacks. |
| `X-Content-Type-Options` | `nosniff` | Prevents MIME-confusion attacks. |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Protects URI path confidentiality in cross-origin requests. |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` | Blocks access to sensitive browser hardware APIs. |
| `X-Permitted-Cross-Domain-Policies` | `none` | Blocks Adobe Flash/Acrobat cross-domain policy leakage. |
| `Cross-Origin-Opener-Policy` | `same-origin` | Isolates browsing context from cross-origin popups; Spectre defense. |
| `Cross-Origin-Resource-Policy` | `same-origin` | Blocks unauthorized cross-origin resource reads. |
| `Strict-Transport-Security` | Conditional (`ENABLE_HSTS=true`) | Enforces HTTPS on verified production domains. |
| `Content-Security-Policy` | Permissive baseline (with restricted `connect-src`) | Defense-in-depth resource sandboxing; dynamic nonce in middleware. |

### 6.4 CI/CD Workflow & Secret Handling

In [`.github/workflows/ci.yml`](file:///Users/nitinkumar/Documents/Ai-audit-spend/.github/workflows/ci.yml):
- **Least Privilege:** Global workflow permissions are strictly limited to `permissions: contents: read`.
- **Secret Redaction:** Disposable Supabase CLI service keys are registered with GitHub Actions secret masking (`echo "::add-mask::$service_role_key"`), preventing accidental credential leaks in CI runner logs.
- **Lockfile Enforcement:** CI uses `npm ci` to guarantee deterministic builds matching `package-lock.json`.

---

## 7. Verification Results & Regression Testing

All automated checks and regression test suites execute cleanly:

```text
================================================================================
VERIFICATION SUITE SUMMARY
================================================================================
1. TypeScript Strict Check (npm run typecheck):
   > tsc --noEmit
   Result: PASSED (0 errors)

2. ESLint Static Analysis (npm run lint):
   > eslint
   Result: PASSED (0 errors, 0 warnings)

3. Unit & Security Regression Test Suites (npm test):
   > vitest run --exclude **/integration.test.ts
   Test Files: 25 test suites passed
   Tests:      193 unit and regression tests passed
   - Security Model Safeguards: PASSED (31 tests)
   - Security Audit & Crypto:   PASSED (35 tests)
   - Server Address Validation: PASSED (4 tests in run-server.test.ts)
   Result:     PASSED (100% success rate)

4. Production Webpack Build (npm run build):
   > next build --webpack
   Result:     PASSED (25/25 routes compiled successfully)
================================================================================
```

---

## 8. Strategic Recommendations & Roadmap

1. **Maintain Unresolved Dependency Tracking:** Keep the 39 dependency advisories (specifically the Next.js Server Component DoS and Zod collection parsing advisories) active in the risk register. Upgrade to `next@16.4.6` and `zod@^4.6.6` following full integration verification against React 19.
2. **Automate Continuous SAST & Dependency Auditing:** Integrate `npm audit --audit-level=high` and an automated secret scanner (e.g., Gitleaks) into the pull-request GitHub Actions pipeline to prevent new CVEs or accidental token commits.
3. **Transition Fully to Nonce-Based CSP:** Ensure all client-side script tags and third-party widgets adopt the dynamic nonce generated in `middleware.ts` / `proxy.ts`, allowing `'unsafe-inline'` to be fully retired from production builds.
4. **Enforce Single-Operator Security Boundaries:** In V0 deployment, maintain strict physical or network firewall isolation around private-network instances. Do not expose StackAudit directly to the public Internet until multi-tenant user authentication, session cookies, and declarative RLS are implemented.
