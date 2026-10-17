# Repository audit

Audit snapshot: 17 October 2026. This records the repository state observed during the audit and the changes made in this pass. It is an engineering review, not a security certification.

## Architecture and product path

The application is a Next.js 16 / React 19 app backed by Supabase Postgres. `core/providers` normalizes OpenAI and Anthropic inputs; `core/usage` owns CSV parsing, ingestion, and repricing; `core/pricing` owns effective-date lookup and decimal-safe cost calculation; `core/workloads` owns attribution rules; and `core/outcomes`, `core/audit`, and `core/monitoring` implement outcomes, findings, and alerts. Route handlers under `app/api/v1` provide the HTTP boundary, and `app/app` consumes those endpoints.

The intended path is partly connected. Provider adapters and unit-tested cost calculation exist. Usage ingestion writes organization-scoped records and marks missing-price rows `is_unpriced`, but stores a placeholder `calculated_cost` of zero. Workload attribution is derived from API-key rules. Outcome analytics use SQL aggregation. Audit and monitoring services consume stored records. Dashboard routes independently aggregate data in JavaScript, so not every view shares one aggregation implementation. The demo seed inserts raw rows directly rather than exercising the complete ingestion pipeline.

## Prioritized findings

| Priority | Finding and evidence | Action / status | Risk or release impact |
| --- | --- | --- | --- |
| P1 | Cached-token columns are subsets of total input tokens (the pricing calculator documents and enforces this), but usage, overview, trends, audit, and dashboard RPC aggregation added cache counts a second time. | Corrected route and audit aggregates, added a forward migration for dashboard RPCs, and added shared metric helpers and unit tests. | Data correctness defect; end-to-end route reconciliation tests are still needed. |
| P1 | Rows without a matching price are persisted with `calculated_cost: '0'`; some dashboard paths sum that placeholder without surfacing `is_unpriced`. Cost-per-outcome can therefore look complete when it is partial. | Not fully corrected. Ingestion records `is_unpriced`, but views need to carry unknown pricing through summaries and CPO as unavailable. | Blocks trustworthy financial reporting; public preview should disclose it. |
| P1 | Dashboard summary computes top-level cost-per-outcome from all organization cost when exactly one outcome type exists, including cost from workloads with no matching outcomes. | Not fully corrected; current code labels this as an aggregate across all workloads. It needs a defined allocation rule or must show only per-workload values. | Can materially misstate unit economics when workloads differ. |
| P1 | Development auth falls back to the first organization when `DEMO_ORG_ID` is unset. The server uses a service-role-capable client and RLS is not enabled in the migrations. | Documented prominently in README and SECURITY. Production auth/RLS redesign remains required. | Blocks shared or production deployment; local single-user preview only. |
| P1 | Demo seeding clears records belonging to a fixed organization, ignores earlier cleanup errors, previously accepted fake credentials, and wrote `DEMO_ORG_ID` into `.env.local`. It also has separate hand-written pricing. | Removed the duplicate obsolete JavaScript seeder; the TypeScript seed now requires a service key, blocks remote URLs unless explicitly enabled, checks cleanup, uses the shared decimal calculator, and no longer writes `.env.local`. | Seed remains destructive within its fixed demo organization and is not fully deterministic or pipeline-based. Use only against a disposable local database. |
| P2 | README was the create-next-app template, `.env.example` and contributor guidance were absent, the license was missing, and metadata described a different subscription-audit product. | Replaced setup/product docs, added `.env.example` and CONTRIBUTING, aligned metadata, and recorded the license decision. | Missing license is a hard public distribution decision; no license was chosen. |
| P2 | `components/marketing` was unreachable because `/` redirects directly to `/app/dashboard`; its pages described unsupported seat discovery/offboarding and contained repeated fabricated testimonial copy. `framer-motion` was used only by those components. | Removed the seven unreferenced marketing components and removed the now-unused dependency. | Safe because no app route or component imported them; the root redirect remains the actual entry point. |
| P2 | `npm test` included Supabase integration suites that failed when credentials were absent; the workflow supplied a placeholder service-role value. There was no `supabase/config.toml`, although CI started the local stack and used `db push`. | Default tests now run unit tests only; CI obtains local CLI credentials, resets the local database from migrations, and runs typecheck/lint/build. Added minimal Supabase config. | CI changes require a GitHub Actions run to confirm current CLI output and Docker behavior. |
| P2 | Production builds attempted to download Inter from Google Fonts, which failed in offline/restricted environments. | Replaced the remote build-time font dependency with system font stacks. | Visual typography may differ slightly. |
| P2 | Lint reported 89 errors at baseline; after removing the unused marketing code and cleaning seed variables it still reports 72 errors and 23 warnings, mostly explicit `any` across route handlers, core services/tests, and scratch scripts. | Not comprehensively refactored; use lint output as a cleanup backlog. | External contributors will see a failing lint command until fixed. |
| P2 | Usage API loads the full selected time range into memory before filtering and pagination; dashboard routes also aggregate rows in JavaScript. Query sizes are not consistently bounded. | Not fixed in this pass. | Large organizations may see slow or truncated/inconsistent results. |
| P3 | `test-attr.js` and `test-queries.js` are ad hoc scripts with no package script or CI reference; migration history and `full_setup.sql` remain operationally ambiguous. | Retained because their purpose and safety were not established well enough for deletion. | Review before packaging a public release. |

## Security and repository hygiene

- `.gitignore` excludes `.env*` and now explicitly permits `.env.example`.
- No tracked `.env` file was found in the repository inventory. This does not establish that Git history has never contained secrets.
- No automated secret scanner was available/run in this pass.
- Webhook delivery has HTTPS checks, DNS resolution checks, timeouts, and redirect blocking. The hand-written private-IP filter is incomplete for some IPv6 and DNS rebinding cases; harden it before accepting untrusted webhook URLs.
- API organization scoping is present in many queried paths, but the service-role client makes missed scopes high impact. RLS and end-to-end isolation tests are still required.

## OSS readiness scorecard

Scores are engineering judgments based on the files and checks inspected.

| Area | Score | Evidence |
| --- | ---: | --- |
| Core functionality | 5/10 | Meaningful domain modules and API routes exist; dashboard and demo flows remain partly disconnected. |
| Architecture and maintainability | 5/10 | Domain folders and shared pricing logic are useful; route-level aggregation and many lint errors weaken boundaries. |
| Test quality | 5/10 | 53 unit tests pass, including pricing, provider, ingestion metrics, workload, outcome, and monitoring behavior; integration tests require Supabase and route reconciliation coverage is thin. |
| Data correctness | 4/10 | Decimal engine and effective pricing exist; unpriced zero placeholders, token duplication (fixed here), and independent aggregation remain concerns. |
| Security | 3/10 | Auth checks and several hardening measures exist; service-role access, development fallback, missing RLS, and incomplete webhook IP checks remain. |
| Developer experience | 5/10 | Setup docs and sample environment are now present; no license, broad lint failures, and Supabase/Docker requirements remain. |
| Documentation | 5/10 | Product setup, architecture outline, and limitations are documented; provider/API references and some claims still need verification against implementation. |
| Contributor extensibility | 5/10 | Core domain modules are separable and provider abstractions exist; public contribution process is now documented but licensing and type quality are unresolved. |
| Self-hosting and reproducibility | 4/10 | Supabase migrations/config and seed path exist; seed behavior and CI integration require a real local Supabase verification. |
| Public-release readiness | 3/10 | Useful early preview, but license, security boundaries, math visibility, lint, and database verification remain release blockers. |

## Remaining release decisions

1. Select and add an explicit license. Until then, do not claim that the repository is licensed for general OSS reuse.
2. Decide whether V0 is strictly single-user/local or supports multiple organizations; then align RLS, authentication, and API authorization to that scope.
3. Represent unpriced cost as unavailable throughout dashboards and CPO, with visible unpriced counts.
4. Make seed generation repeatable and safe for reruns, and calculate rows through the same pricing and ingestion contracts used by production paths.
5. Bound database reads and consolidate/reconcile dashboard aggregates; add behavioral route tests for totals and time-window boundaries.
6. Resolve lint errors and run CI against a real local Supabase stack.
