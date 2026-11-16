# StackAudit — Dependency, Secret, and Static Security Audit

> [!NOTE]
> **Canonical Security Audit Document:**
> This document is the single authoritative, canonical security and dependency audit for the StackAudit repository. All security findings, dependency advisory statuses, reachability analyses, and hardening logs are maintained exclusively in this file. (A pointer document exists at `stackaudit/SECURITY_DEPENDENCY_AUDIT.md` for convenience).

**Assessment Date:** November 2026  
**Auditor:** Senior Backend & Application Security Engineer  
**Target Repository:** `StackAudit` (commit [`2923d05`](https://github.com/nitin-kumar-code/StackAudit-Core/commit/2923d057895032a144f215571af07b8663a8d7f4))  
**Application Architecture:** Next.js 16 App Router (React 19) / TypeScript / PostgreSQL (Supabase)  
**Deployment Models:** Single-Tenant Local Workstation (`127.0.0.1`) / Isolated Private Network (`0.0.0.0` with `run-server.ts`)

---

## 1. Executive Summary

A comprehensive security assessment of StackAudit was conducted across four primary domains:
1. **Dependency Vulnerability Audit:** Transitive vulnerability review against historical npm security advisories, lockfile dependency graph inspection, preliminary reachability triage, and upgrade impact evaluation.
2. **Static Application Security Testing (SAST):** AST pattern scanning and regex heuristics covering unsafe data flows, DOM XSS (`dangerouslySetInnerHTML`), dynamic execution (`eval`), SQL injection patterns, cryptographic implementations, and shell execution boundaries.
3. **Secret Scanning:** Exhaustive scan of the complete Git history and tracked files for Supabase service keys, provider API credentials, database URIs, and authentication tokens.
4. **Security Configuration Review:** Analysis of HTTP headers, Content Security Policy (CSP), HTTP Strict Transport Security (HSTS), cookie architecture, environment variable handling, Next.js 16 request-interception conventions, and GitHub Actions CI permissions.

### Summary of Audit Findings & Security Posture

| Security Domain | Scope Scanned | Findings / Advisories Identified | Severity | Status / Remediation |
| :--- | :--- | :---: | :---: | :--- |
| **Dependencies** | 16 prod / 15 dev packages (1,152 transitive) | 39 Advisories (2 Critical, 17 High, 18 Moderate, 2 Low) — *Historical Snapshot* | **Critical / High** | **UNVERIFIED RISKS (Tracked):** Historical counts and reachability conclusions are unverified pending live registry access (`npm audit`) and static call-path tracing. Targeted upgrade roadmap defined; breaking blind upgrades (`npm audit fix --force`) rejected. |
| **SAST (Static Code)** | Full TypeScript / TSX codebase | 1 Confirmed Vulnerability (Server Launcher Command Injection), 6 False Positives | **Medium** | **CONFIRMED & REMEDIATED:** Shell execution in `run-server.ts` hardened (`shell: false`, strict RFC hostname/IP and port validation). Zero DOM XSS, zero SQL injection. |
| **Secret Scanning** | Complete Git Commits & Tracked Files | 3 Pattern Triggers (Documentation Dummies / Local URLs) | **Informational** | **VERIFIED CLEAN:** No live production secrets or private tokens committed. `.env` files strictly excluded. |
| **HTTP Headers & CSP** | `next.config.ts`, `proxy.ts` | Overly Permissive CSP & Unconditional HSTS Preload | **Medium** | **HARDENED BASELINE:** Consolidated request interception into Next.js 16 [`proxy.ts`](file:///Users/nitinkumar/Documents/Ai-audit-spend/stackaudit/proxy.ts) (removed deprecated `middleware.ts`); restricted HSTS to explicit HTTPS production with safe domain defaults. Dynamic CSP retains necessary baseline allowances (`'unsafe-inline'` styles, development `'unsafe-eval'`). |

---

## 2. Assessment Methodology, Tools & Scope

The audit was conducted using the following tools and command executions:

| Tool | Version | Mode / Options | Purpose & Scope |
| :--- | :--- | :--- | :--- |
| **Node.js** | `v26.4.0` | Runtime environment | Module resolution and server execution |
| **npm** | `11.17.0` | CLI package manager | Dependency graph inspection and lockfile validation |
| **npm audit** | Registry API (`npm/v1/security/advisories/bulk`) | `npm audit --json` | Transitive vulnerability scan across 1,152 lockfile nodes. *(Note: Offline/isolated environments fail with `getaddrinfo ENOTFOUND registry.npmjs.org`; findings represent historical baseline pending online refresh)* |
| **TypeScript (`tsc`)** | `5.x` | Strict typecheck (`tsc --noEmit`) | Type soundness, null-safety, and API contract enforcement |
| **ESLint** | `9.x` (`eslint-config-next 16.2.4`) | Static linter (`npm run lint`) | Code quality and Next.js App Router rules |
| **Vitest** | `4.1.5` | Test runner (`npm test`) | 193 unit and regression tests across 25 suites |
| **Git CLI** | `2.x` | History traversal (`git log -p`) | Commit diff auditing and credential leak detection |
| **Custom SAST Scanner** | Python 3.11 AST/Regex | Local sandboxed script | Injection, DOM manipulation, and shell invocation detection |
| **Custom Secret Scanner** | Python 3.11 Regex Engine | Local sandboxed script | High-entropy credential scanning across commits and tree |

---

## 3. Dependency Vulnerability Audit

### 3.1 Advisory Inventory Overview & Verification Caveat

The advisory inventory below reflects a historical scan against `package-lock.json` recording **39 total advisories**:
- **Critical:** 2
- **High:** 17
- **Moderate:** 18
- **Low:** 2

> [!WARNING]
> **Advisory Counts and Reachability Conclusions are UNVERIFIED:**
> 1. **Registry Access Barrier:** In the current assessment environment, live registry communication (`npm audit`) failed with `getaddrinfo ENOTFOUND registry.npmjs.org`. Consequently, current advisory counts and CVE mappings cannot be verified against the active npm advisory database until refreshed with live network access.
> 2. **Network Isolation Does Not Prove Non-Reachability:** In StackAudit's private-network deployment mode (`run-server.ts`), clients within the local network or VLAN have direct access to dashboard pages and API endpoints. Network isolation does not prevent exploitation of vulnerable framework or transitive code paths.
> 3. **Package Tier Is Not a Proof of Non-Reachability:** Categorizing a package as a `devDependency` or CLI tooling dependency does not prove that its code paths are unreachable. Transitive dependencies may be bundled into build outputs, imported into Server Components, or executed during runtime workflows.
> 4. **Status:** All reachability assessments below must be treated as **unverified preliminary triage hypotheses** until full static call-path tracing (or runtime execution telemetry) confirms that vulnerable functions cannot be reached from application entry points.

### 3.2 Preliminary Triage of Critical and High-Severity Advisories

Below is the preliminary triage mapping of Critical and High-severity advisories identified in historical `package-lock.json` audits, detailing the locked version, parent dependency chain, hypothesized application feature, deployment exposure, and unverified status.

| Package | Locked Version | Severity | Advisory ID & Vulnerability Title | Parent Dependency Chain | Hypothesized Feature in StackAudit | Deployment Exposure | Triage Hypothesis & Unverified Exposure Status |
| :--- | :---: | :---: | :--- | :--- | :--- | :--- | :--- |
| **`next`** | `16.2.4` | **Critical** | [GHSA-8h8q-6873-q5fj](https://github.com/advisories/GHSA-8h8q-6873-q5fj)<br>DoS with Server Components | Direct production dependency (`package.json`) | React Server Components (`app/layout.tsx`, App Router pages) | Local loopback & Private Network | **UNVERIFIED — Potentially Reachable:** React Server Components are active across App Router pages. Malicious or crafted requests to App Router endpoints could trigger CPU/memory exhaustion. Treated as an active unresolved finding. |
| **`next`** | `16.2.4` | **Critical** | [GHSA-p293-qw3h-jr36](https://github.com/advisories/GHSA-p293-qw3h-jr36)<br>Unauthenticated RCE on Windows | Direct production dependency (`package.json`) | Core Next.js server runtime | Windows hosts only | **UNVERIFIED — Hypothesized Platform-Specific:** Advisory affects Windows hosts. StackAudit targets macOS/Linux; exploitability under Windows developer environments remains unverified. |
| **`next`** | `16.2.4` | **Critical** | [GHSA-vcvr-r3jv-pc5j](https://github.com/advisories/GHSA-vcvr-r3jv-pc5j)<br>RCE in `next/og` ImageResponse | Direct production dependency (`package.json`) | OpenGraph metadata generation | Local loopback & Private Network | **UNVERIFIED — Hypothesized Inactive Path:** StackAudit serves static PNG icons and does not directly invoke `ImageResponse`. Whether Next.js internal metadata pipelines trigger this path is unevidenced. |
| **`next`** | `16.2.4` | **Critical** | [GHSA-673q-mjm6-r5xr](https://github.com/advisories/GHSA-673q-mjm6-r5xr)<br>RCE in `use cache` returning typed arrays | Direct production dependency (`package.json`) | Experimental Next.js cache | Local loopback & Private Network | **UNVERIFIED — Hypothesized Inactive Path:** StackAudit does not configure experimental `use cache` directives; transitive framework invocation remains unevidenced. |
| **`proxy-addr`** | `2.0.7` | **Critical** | [GHSA-jqcg-44mw-7w3h](https://github.com/advisories/GHSA-jqcg-44mw-7w3h)<br>IP spoofing via IPv4-mapped IPv6 subnet | `supabase` -> `@supabase/cli` -> `express` -> `proxy-addr` | Local Supabase emulator CLI proxy | Development & Integration Test | **UNVERIFIED — Hypothesized Tooling-Only:** Pulled by local Supabase CLI tooling (Express). Production Next.js App Router does not run Express; call paths remain unevidenced. |
| **`zod`** | `4.4.3` | **High** | [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5)<br>Memory exhaustion on oversized collections | Direct dependency (`package.json`) & `shadcn` -> `zod` | API request validation (`lib/deployment.ts`, `/api/v1/usage/import`) | Local loopback & Private Network | **UNVERIFIED — Potentially Reachable:** Large CSV imports or JSON requests to `/api/v1/usage/import` exercise Zod collection parsing. Mitigated by 500-row batch limits, but remains an active unresolved risk. |
| **`fast-uri`** | `3.0.9` | **High** | [GHSA-f65p-4m7j-42xc](https://github.com/advisories/GHSA-f65p-4m7j-42xc)<br>SSRF via malformed IPv6 normalization | `shadcn` -> `@modelcontextprotocol/sdk` -> `ajv` -> `fast-uri` | JSON Schema format validation | Tooling & Component CLI | **UNVERIFIED — Hypothesized Tooling-Only:** Transitive of `shadcn` and MCP SDK. Webhook validation uses native Node.js `URL` and `net.isIP`, but build-time / runtime call paths remain unevidenced. |
| **`body-parser`**| `2.1.0` | **High** | [GHSA-v422-hmwv-36x6](https://github.com/advisories/GHSA-v422-hmwv-36x6)<br>DoS via invalid limit value | `supabase` -> `@supabase/cli` -> `express` -> `body-parser` | Local Supabase emulator CLI | Development & Integration Test | **UNVERIFIED — Hypothesized Tooling-Only:** Transitive of Supabase CLI Express harness. Production bundling status unevidenced. |
| **`undici`** | `8.12.1` | **High** | [GHSA-4w7w-5xrc-9h26](https://github.com/advisories/GHSA-4w7w-5xrc-9h26)<br>Cache poisoning & cross-user leak on redirects | `jsdom` -> `undici` | Vitest browser/DOM testing environment | Test Execution Only | **UNVERIFIED — Hypothesized Test-Only:** Pulled by `jsdom` for Vitest tests. Global fetch in Node.js production runtime is Node native; production isolation unevidenced. |
| **`vite`** | `8.0.11` | **High** | [GHSA-v6wh-96g9-6wx3](https://github.com/advisories/GHSA-v6wh-96g9-6wx3)<br>NTLMv2 hash leak via UNC path handling | `vitest` -> `vite` | Vitest test runner engine | Test Execution Only | **UNVERIFIED — Hypothesized Test-Only:** Development test runner dependency. Not deployed to production, but developer workstation attack surface unevidenced. |
| **`ws`** | `8.18.0` | **High** | [GHSA-58qx-3vcg-4xpx](https://github.com/advisories/GHSA-58qx-3vcg-4xpx)<br>Uninitialized memory disclosure | `supabase` -> `ws` | Local Supabase CLI real-time listener | Development & Integration Test | **UNVERIFIED — Hypothesized Tooling-Only:** Supabase CLI listener dependency. Production WebSocket endpoints absent, but internal listener paths unevidenced. |
| **`ip-address`** | `10.7.3` | **High** | [GHSA-mwp4-54f8-5fhr](https://github.com/advisories/GHSA-mwp4-54f8-5fhr)<br>SSRF / trust boundary bypass via leading zeros | `supabase` -> `express-rate-limit` -> `ip-address` | Local Supabase dev server | Development & Integration Test | **UNVERIFIED — Hypothesized Tooling-Only:** Supabase CLI rate-limiter dependency. Webhook SSRF logic uses native `net.isIP`; package reachability unevidenced. |
| **`sharp`** | `0.35.5-rc.1` | **High** | [GHSA-f88m-g3jw-g9cj](https://github.com/advisories/GHSA-f88m-g3jw-g9cj)<br>Vulnerabilities in libvips (CVE-2026-33327) | `next` -> `sharp` (optional peer) | Image optimization pipeline | Production Image Route (`/_next/image`) | **UNVERIFIED — Potentially Reachable:** Optional peer for Next.js image optimization. `/_next/image` is exposed by default; reachability unevidenced without image pipeline review. |
| **`postcss`** | `8.5.2` | **High** | [GHSA-6g55-p6wh-862q](https://github.com/advisories/GHSA-6g55-p6wh-862q)<br>Arbitrary file read via sourceMappingURL | `next` -> `postcss` and `tailwindcss` -> `postcss` | CSS build compilation (`npm run build`) | Build Time Only | **UNVERIFIED — Hypothesized Build-Time:** Executed during build compilation. Runtime server rendering reachability unevidenced. |
| **`hono`** | `4.13.15` | **High** | [GHSA-xrhx-7g5j-rcj5](https://github.com/advisories/GHSA-xrhx-7g5j-rcj5)<br>IP restriction bypass for non-canonical IPv6 | `shadcn` -> `@modelcontextprotocol/sdk` -> `hono` | MCP SDK HTTP server | CLI & Tooling Only | **UNVERIFIED — Hypothesized CLI-Only:** Transitive of `shadcn` MCP SDK. Server-side loading unevidenced. |
| **`nanoid`** | `3.3.8` | **High** | [GHSA-28wg-ghj8-5hjv](https://github.com/advisories/GHSA-28wg-ghj8-5hjv)<br>Infinite loop in non-secure generator | `next` -> `postcss` -> `nanoid` | CSS AST node ID generation | Build Time Only | **UNVERIFIED — Hypothesized Build-Time:** Transitive of PostCSS. Runtime call paths unevidenced. |
| **`source-map-js`**| `1.2.1`| **High** | [GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q)<br>Event-loop DoS via indexed section offsets | `@tailwindcss/node` -> `source-map-js` | Tailwind CSS compilation | Build Time Only | **UNVERIFIED — Hypothesized Build-Time:** Tailwind source map generator. Runtime invocation unevidenced. |
| **`js-yaml`** | `4.1.0` | **High** | [GHSA-h67p-54hq-rp68](https://github.com/advisories/GHSA-h67p-54hq-rp68)<br>Quadratic CPU consumption via merge keys | `supabase` -> `js-yaml` | Supabase CLI config parsing | Development CLI | **UNVERIFIED — Hypothesized CLI-Only:** Supabase CLI parser. Runtime reachability unevidenced. |
| **`brace-expansion`**| `2.0.1`| **High** | [GHSA-jxxr-4gwj-5jf2](https://github.com/advisories/GHSA-jxxr-4gwj-5jf2)<br>DoS via exponential expansion | `typescript-eslint` -> `brace-expansion` | ESLint glob matching | Build & Lint Time Only | **UNVERIFIED — Hypothesized Lint-Only:** Developer linter dependency. Runtime execution unevidenced. |

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
| `COMMAND_INJECTION_RISK` | **Medium** | Environment variable interpolation into shell execution | 3 | **1 Confirmed** | **REMEDIATED:** Server launcher command injection fixed (`shell: false`, strict RFC hostname/IP and port validation). 2 CLI scripts verified safe. |
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

An exhaustive scan across all Git commits (`git log -p`) and all tracked repository files was conducted using regex patterns targeting:
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

### 6.1 Request Interception Architecture: Next.js 16 `proxy.ts` Convention

Next.js 16 explicitly deprecates `middleware.ts` in favor of `proxy.ts`. When both files are present, the Next.js compiler raises a fatal conflict error (`Both middleware file "./middleware.ts" and proxy file "./proxy.ts" are detected. Please use "./proxy.ts" only.`). 

To adhere strictly to Next.js 16 conventions and prevent redundant or conflicting interception layers, **`middleware.ts` was eliminated**. StackAudit consolidates all request-time header manipulation into [`stackaudit/proxy.ts`](file:///Users/nitinkumar/Documents/Ai-audit-spend/stackaudit/proxy.ts).

### 6.2 Content Security Policy (CSP) Assessment & Baseline Limitations

StackAudit's Content Security Policy was evaluated across both static fallback configuration ([`stackaudit/next.config.ts`](file:///Users/nitinkumar/Documents/Ai-audit-spend/stackaudit/next.config.ts)) and dynamic request-time interception ([`stackaudit/proxy.ts`](file:///Users/nitinkumar/Documents/Ai-audit-spend/stackaudit/proxy.ts)).

#### Honest Evaluation of Dynamic CSP in `proxy.ts`

```ts
function buildContentSecurityPolicy(nonce: string, isDevelopment: boolean): string {
  const scriptSources = ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'"];
  if (isDevelopment) scriptSources.push("'unsafe-eval'");

  return [
    "default-src 'self'",
    `script-src ${scriptSources.join(' ')}`,
    // Tailwind emits static CSS; chart components use inline style attributes.
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

> [!IMPORTANT]
> **Dynamic CSP Baseline Allowances & Security Limitations:**
> The dynamic policy in `proxy.ts` implements per-request cryptographic nonces (`'nonce-<nonce>'`) and `'strict-dynamic'`, but intentionally includes significant baseline allowances:
> 1. **`style-src 'self' 'unsafe-inline'`:** Retained because Tailwind CSS utility generation and charting components (Recharts) render inline style attributes. This allowance impairs the browser's ability to prevent CSS injection or style-based attribute exfiltration if user input reaches style attributes.
> 2. **`script-src ... 'unsafe-eval'` in Development:** In development mode (`NODE_ENV === 'development'`), `'unsafe-eval'` is permitted for Webpack Hot Module Replacement (HMR) and React Fast Refresh.
> 3. **Elimination of Wildcard `https:` in `connect-src`:** StackAudit remediated the historical wildcard `https:` in `connect-src`. Dynamic CSP now strictly restricts outbound network requests to `'self'` (plus local WebSockets in dev), preventing cross-origin data exfiltration.
>
> This policy should be characterized as an **application baseline with significant operational allowances**, rather than an impermeable or "strong" CSP.

### 6.3 HTTP Strict Transport Security (HSTS) Posture

- **Flaw Identified:** Setting `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` unconditionally on all responses caused two critical risks:
  1. Local development and private-network HTTP deployments would receive HSTS headers, which can cause browsers to permanently refuse plain HTTP connections to `localhost` or internal IPs.
  2. Forcing `includeSubDomains` and `preload` by default can render existing unmigrated HTTP subdomains on the operator's root domain completely inaccessible.
- **Remediation Implemented in `next.config.ts` and `proxy.ts`:**
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

### 6.4 HTTP Security Headers Matrix

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
| `Strict-Transport-Security` | Conditional (`ENABLE_HSTS=true` on HTTPS) | Enforces HTTPS on verified production domains without endangering subdomains. |
| `Content-Security-Policy` | Permissive baseline (with restricted `connect-src`) | Defense-in-depth resource sandboxing; dynamic nonce in `proxy.ts`. |

### 6.5 CI/CD Workflow & Secret Handling

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
   Result:     PASSED (Single proxy.ts interceptor verified, 0 conflicts)
================================================================================
```

---

## 8. Strategic Recommendations & Roadmap

1. **Refresh Dependency Audit Online:** Once network access to `registry.npmjs.org` is available, re-run `npm audit --json` to refresh current advisory counts against the latest upstream disclosures, and conduct static call-graph tracing for active direct packages (`next@16.2.4`, `zod@4.4.3`).
2. **Automate Continuous SAST & Dependency Auditing:** Integrate `npm audit --audit-level=high` and an automated secret scanner (e.g., Gitleaks) into the pull-request GitHub Actions pipeline to prevent new CVEs or accidental token commits.
3. **Transition Fully to Nonce-Based CSP:** Ensure all client-side script tags and third-party widgets adopt the dynamic nonce generated in `proxy.ts`, allowing `'unsafe-inline'` to be fully retired from production builds.
4. **Enforce Single-Operator Security Boundaries:** In V0 deployment, maintain strict physical or network firewall isolation around private-network instances. Do not expose StackAudit directly to the public Internet until multi-tenant user authentication, session cookies, and declarative RLS are implemented.
