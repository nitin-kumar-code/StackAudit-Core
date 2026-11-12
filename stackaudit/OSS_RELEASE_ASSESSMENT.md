# StackAudit OSS release assessment

**Assessment date:** 30 October 2026  
**Scope:** current `stackaudit/` source tree and available local checks. This is an engineering/product assessment, not a security certification. The worktree contains pre-existing edits in `README.md`, `CONTRIBUTING.md`, `package.json`, and `AUDIT_REPORT.md`, plus untracked `LICENSE`, `output/`, and `tmp/`; this assessment leaves them untouched.

## Verdict

**NOT READY for a general public V0 release.** A clearly labeled, source-only experimental preview is defensible after the clean-install/demo path is made honest and the README stops implying a turnkey flow. A public repo is licensed under Apache-2.0 in the current untracked `LICENSE`, but the first-run sequence presently depends on manual pricing setup and development-only implicit organization selection. A public application deployment or sensitive-data use is not safe.

The product has substantive domain code and passing fast checks: `npm run typecheck`, `npm run lint`, and `npm test` passed (17 files / 88 tests); `npm run build` passed after rerunning outside the sandbox that had denied Turbopack's local worker port binding. Supabase integration tests and migration execution were not verified: the Supabase CLI is absent (`supabase: command not found`).

## Capability and release checklist

| Area | Status | Evidence and implication |
|---|---|---|
| Product core | IMPLEMENTED BUT NOT FULLY VERIFIED | `core/` has pricing, canonical usage, attribution, outcomes, audits, monitoring, and alert services. Integration depends on Supabase RPC/schema behavior that could not be run locally. |
| Financial metrics | IMPLEMENTED BUT NOT FULLY VERIFIED | Decimal arithmetic and effective price lookup exist. Unpriced rows are marked and summary APIs can return incomplete/null totals. The legacy `calculated_cost` column remains `NOT NULL` and ingestion stores `'0'` as a placeholder alongside `is_unpriced`; all display paths need a database-backed reconciliation check. |
| CPO correctness | PARTIALLY IMPLEMENTED | Workload/outcome-type/time-window scoped aggregates exist and incomplete pricing produces unavailable results. The formula assigns all workload cost to each outcome type; it is not allocation across multiple outcome types. Outcome counts carry no quality, success, reversal, retry, or human-review semantics. |
| Providers | LIBRARY PRIMITIVE ONLY | OpenAI and Anthropic adapter code is not wired to credential configuration, persistence, pricing, attribution, or a user-facing connection flow. OpenAI normalization also does not match the current documented response fields. |
| CSV | IMPLEMENTED FOR V0 | Usage page upload, sample CSV, quoted field parser, row-level validation, duplicate detection, workspace-scoped persistence, pricing and unpriced reporting are available. |
| Pricing catalog | PARTIALLY IMPLEMENTED | Effective-dated records and ambiguity checks exist. Migrations do not seed catalog prices. A fresh `supabase db reset` therefore leaves the seeder with no OpenAI/Anthropic prices; `scripts/seed-demo-data.ts` explicitly exits with “catalog has no … records.” No maintained provenance/update pipeline exists. |
| Workload attribution | PARTIALLY IMPLEMENTED | API-key attribution rules and workload CRUD exist. Provider adapter events have API-key identifiers, but CSV parser does not accept attribution data and normal usage ingestion is not exposed as a supported route. No client/project/accounting dimensions for agencies beyond workload naming. |
| Outcomes | PARTIALLY IMPLEMENTED | `POST /api/v1/outcomes`, idempotency, count/type/time/metadata are implemented. A success count is only a caller assertion; there is no correction/reversal or quality model. |
| Audit | IMPLEMENTED BUT NOT FULLY VERIFIED | Rules and evidence persistence exist. They compare recorded workload aggregates and are not invoice reconciliation or proof of provider overbilling. Integration requires database functions. |
| Monitoring/alerts | PARTIALLY IMPLEMENTED | On-demand and secret-protected cron paths, monitoring configs, alerts, and webhook channel code exist. No scheduled job is provisioned; Slack/email are absent; webhook delivery/security needs deployment-specific review. `CRON_SECRET` and webhook encryption configuration are not in `.env.example`. |
| Dashboard | IMPLEMENTED BUT NOT FULLY VERIFIED | Next app routes and dashboard pages build. No screenshots/demo walkthrough; client components call APIs without a visible auth/session bootstrap, so usable end-to-end UI is unproven. |
| API | PARTIALLY IMPLEMENTED | Route handlers cover usage reads, workloads, outcomes, audits, analytics, alerts, monitoring, and internal jobs. No OpenAPI spec, API auth guide, consistent ingestion endpoint, pagination across every resource, or auth SDK. |
| Isolation/security | BROKEN for shared/hosted use | V0 is a single-user local preview. API routes use a server-side service-role Supabase client and configured workspace scoping; the service role bypasses RLS. Do not treat this as multi-tenant isolation. |
| Authentication/onboarding | PARTIALLY IMPLEMENTED | `getAuthOrgId` validates Supabase bearer JWT and server-controlled `app_metadata`; org setup route exists. No signup/login/session UI is evident, and onboarding's POST does not send a bearer token although the route requires one. Org setup is not a working unauthenticated first-run path. |
| Self-hosting | PARTIALLY IMPLEMENTED | Supabase migrations/config and setup notes exist. Clean pricing and UI auth gaps break the documented seed/onboarding flow. Docker Compose is absent. |
| Demo seed | IMPLEMENTED BUT NOT FULLY VERIFIED | Seed generation is fixed-seed, ownership-marked, and refuses remote targets unless explicitly hostname-pinned; cleanup is limited to the marked demo org. But a clean catalog has no price rows, and local DB behavior was not run. |
| Tests | IMPLEMENTED BUT NOT FULLY VERIFIED | 88 unit tests pass. Integration suites are present but need local Supabase/Docker and were not run. No CI workflow exists in this checkout. |
| CI | NOT PRESENT | No `.github/workflows/` files found. |
| Docs/API architecture | PARTIALLY IMPLEMENTED | README, subsystem READMEs, SECURITY and CONTRIBUTING exist. No changelog, complete API reference, runbook, deployment guide, or standalone architecture diagram. |
| License | IMPLEMENTED BUT NOT FULLY VERIFIED | Root `LICENSE` contains Apache-2.0 and package metadata declares it; both are currently untracked/pre-existing user work. No author/copyright holder is named in the license boilerplate. Do not alter the owner's selection. |
| Third-party assets | IMPLEMENTED BUT NOT FULLY VERIFIED | Public SVGs include Next/Vercel/template marks and no in-file provenance. Clarify upstream attribution/trademark and replace/remove assets whose redistribution terms are unclear before polished launch. |
| Repository hygiene | PARTIALLY IMPLEMENTED | `.gitignore` excludes env files except `.env.example`. The worktree has unrelated untracked `output/` and `tmp/`; verify their contents and ensure no generated data/secrets enter a release. `full_setup.sql` duplicates migration history and risks drift. |
| Commercial capability | NOT PRESENT | No Stripe, checkout, plan/entitlement, billing webhook, usage metering, or hosted ops surface found. |

## Earlier risk status

| Earlier issue | Current finding | Release impact |
|---|---|---|
| Unpriced usage counted as zero | Ingestion still persists a zero placeholder but marks `is_unpriced`; shared metrics and latest RPCs exclude it and signal incomplete totals. Remaining display/legacy-RPC paths need database-backed verification. | Blocks trustworthy financial claims until all views are reconciled. |
| Incorrect org-level CPO | Current API explicitly scopes by workload and outcome type. Dashboard summary must be checked for accidental aggregate CPO; any organization-wide single ratio across unrelated work is not valid. | Do not market a blended org CPO. |
| RLS/auth boundaries | V0 migration enables RLS and denies browser-role access; API uses service role and an explicitly configured workspace. Service role bypasses RLS. | Hard blocker for shared/hosted production. Source preview only with explicit warning. |
| Demo seed safety | Ownership marker, deterministic fixture generation, host guard and scoped cleanup are present. It is destructive within the marked demo org by design. | Good safeguards, but not verified against real local Supabase and fails with empty pricing. |
| Duplicate aggregation | `core/usage/metrics.ts` centralizes some rules; substantial SQL RPC aggregation remains separate by route/use case. | Reconciliation tests required; do not claim a single shared aggregation path. |
| Unbounded Usage API | Latest route limits page size to 100, range to 366 days, and uses a bounded aggregate RPC. | This named issue appears addressed in source; still requires SQL execution and load/query-plan verification. |
| Lint failures | `npm run lint` passes in current worktree. | Resolved for current installed dependencies/config. |
| Supabase migrations/integration | Not verified; CLI missing. | Release blocker for installation confidence. |
| License | Apache-2.0 text is present as untracked `LICENSE`, package field says Apache-2.0. | Licensing choice exists; verify tracked release includes it and resolve boilerplate ownership/provenance. |
| Assets provenance | Still undocumented. | Resolve before public launch assets/release. |
| Clean install | `npm ci` was not rerun; existing `node_modules` was present. Production build and scripts worked in existing install. Fresh install plus local DB remains unverified. | Release blocker for a “clone and run” claim. |

## Checks run

- `npm run typecheck` — PASS.
- `npm run lint` — PASS.
- `npm test` — PASS, 17 files / 88 tests; excludes `**/integration.test.ts` by package script.
- `npm run build` — PASS outside sandbox; sandbox attempt failed because Turbopack could not bind a local worker port (`Operation not permitted`), an environment restriction rather than an application error.
- `supabase status` — BLOCKED; CLI not installed. Integration tests, migrations, pricing seeding, and clean setup were not executed.
- `npm ci` — NOT RUN; existing dependencies were present.

## Concrete blockers before public V0

1. Fix a reproducible clean first-run: include reviewed/versioned pricing fixtures or a safe fixture loader, seed demo data from empty DB, and verify every command on a clean checkout.
2. Decide “single-user local preview” vs multi-user. Remove implicit first-org fallback even in preview; if multi-user, add session onboarding, server-side authorization, RLS/policies, membership roles, and isolation tests before data exposure.
3. Keep provider adapters labeled as library primitives until end-to-end credential setup, API verification, sync/import, and error handling are implemented. CSV is the supported V0 ingestion path.
4. Reconcile summary/dashboard/audit/CPO against SQL integration fixtures, especially unpriced events, multiple outcomes, empty days, half-open time bounds, and unattributed cost.
5. Add CI that runs install, unit checks, build, and a Supabase migration/integration job. Current repo has no workflow.
6. Add minimum HTTP/API and deployment documentation; inventory all schema/RPC assumptions and remove ambiguity between migration history and `full_setup.sql`.
7. Confirm public assets and license notices/ownership, and exclude unrelated generated/temp files from release.

## Release disposition

**Current: NOT READY.** A deliberately labeled experimental source preview may be published once the maintainer is comfortable with the current Apache-2.0 work and the README clearly calls out the setup/auth gaps. Do not present it as a usable hosted service or production finance system. Public V0 should wait for clean-install proof, nonempty demo pricing path, an explicit auth scope, SQL integration coverage, and CI.
