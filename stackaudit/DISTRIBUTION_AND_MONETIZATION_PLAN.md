# StackAudit distribution and monetization plan

**Assessment date:** 30 October 2026. This is a plan based on the current repo, not evidence of demand. No customer payments, pilots, or commercial mechanisms were found in source.

## GitHub release strategy

### Repository and release

Keep one repository now. The app, domain modules, Supabase schema, and dashboard currently form one tightly coupled product; splitting before an independent consumer or versioning boundary exists would make install, migrations, compatibility, and contributions harder. Consider extracting `core` only after a stable provider-independent public API is consumed by a CLI/SDK or external project. Pricing data should have clear provenance and release/version cadence before becoming its own package.

Suggested root structure (mostly current): `app/` routes/UI, `core/` domain logic, `lib/` auth/database/security, `supabase/migrations/`, `scripts/`, `docs/`, and a top-level `examples/` with canonical CSV/outcome integration. Keep a single supported setup path. Remove/label historical `full_setup.sql` once migration authority is explicit.

Before public V0:

- Public repo description: “Self-hosted AI usage cost by workload, with pricing completeness made visible.”
- README needs working clean install, screenshots, sample CSV, one outcome POST, exact limitations, and tested command output.
- Add `.github/workflows/` CI for lockfile install, typecheck, lint, unit tests, production build, and local Supabase migrations/integration.
- Enable issues and discussions with templates; maintain a small set of “good first issue” tickets that are independently actionable.
- Publish versioned GitHub releases only after clean install and migrations pass; use semantic version tags after schema/API compatibility policy is decided. Keep a changelog with migration notes.
- Add architecture/API docs, security reporting process and response expectations. Verify current owner/security reporting path is actionable.
- Track stars/forks as discovery signals only; activation is successful fresh setup + first imported dataset, and commercial evidence is payment/commitment.
- Add repo topics such as `llm`, `ai-costs`, `observability`, `self-hosted`, `supabase`, `nextjs` only if these accurately describe current usable scope.

### Distribution formats

| Channel | Recommendation now | Why |
|---|---|---|
| GitHub source | First distribution after preview blockers are disclosed | This is a Next.js app plus schema; source is most honest and easiest to iterate. |
| Docker Compose | Add once clean setup is solved | Reduces DB/runtime friction, but containerizing broken onboarding only packages the same failure. |
| GHCR/Docker Hub | Defer until tagged, reproducible image is built in CI and upgrade/migration behavior documented | An app image needs a supported configuration and migration contract. |
| GitHub Releases | Use for source archive/release notes after checks | Useful for immutable versioned snapshots. |
| npm | Do not publish the whole Next app. Later, consider a small provider-neutral TypeScript event client or core cost calculator after API stability and consumers exist. | `package.json` currently marks app private; no independent package contract exists. |
| PyPI | Not now | No Python implementation; building one before proving workflows duplicates maintenance. |
| CLI | Potentially valuable after canonical CSV import is real; keep in same repo initially | An import/validation CLI might be the smallest way to get data in, but currently absent. |

## Discovery channels

Use channels to learn from the right users and drive a concrete action (try the documented import, share an export schema, or request a paid assessment). Do not mass-post. Current maturity is suitable for focused technical conversations, not a “production ready” launch.

| Channel | Audience / useful contribution | Desired action | Maturity fit and success signal |
|---|---|---|---|
| Show HN | Engineers; publish a technically candid walkthrough of workload attribution and unpriced visibility, with reproducible sample data | Run local demo or critique workflow | After clean install works. Success: relevant users complete setup and discuss real export/integration needs, not upvotes alone. |
| Reddit | Relevant LLM/engineering communities; share a real technical write-up, follow community rules | Try sample import; identify provider export pain | Small, tailored posts only after use path exists. Success: qualified user interviews and tested imports. |
| X | AI engineering founders/builders; short clips and implementation notes | Ask for a short workflow interview or preview | Useful for recruiting conversations; likes/follows are not demand. |
| LinkedIn | CTOs, engineering leads, agency owners; anonymized workload-cost case study only with permission | Book a structured discovery or paid audit | Better once a real audit can be delivered; success is a paid engagement or dataset review. |
| Technical blog/SEO | Engineers searching for provider cost allocation; publish CSV mapping, cost math, cache-token semantics, and limits | Use example and reach import guide | Durable after content reflects actual validated ingestion. Track qualified activation/search queries, not pageviews only. |
| Developer communities | Supabase/Next.js/LLM tool communities; contribute fixes and answer relevant questions | Review setup/API design | Participate before promoting; success is repeated contributor/user feedback. |
| AI/LLM engineering groups | Teams with production usage; show attribution and outcome instrumentation examples | Share sanitized sample exports / pilot | Best discovery fit, with trust and data-handling protocols first. |
| Tool partnerships | Provider observability/FinOps tools; propose export compatibility or joint technical example | Validate whether they see a gap | Defer outreach until canonical import works and StackAudit offers clear complement. |
| Direct startup/agency outreach | Small set of teams with provider spend and product-level workloads | Offer a fixed-scope paid assessment | Start now with founder-led conversations; no scraping/spam. Success requires payment, signed pilot or concrete data access under agreed terms. |

## Minimum launch assets

**Required for a public preview:** tested clean local setup; clear README and limitations; versioned sample pricing with provenance; synthetic demo data; one real screenshot; short technical flow (ingest → price → workload → incomplete-data flag); architecture diagram; minimal API example; security warning; contributing guide; license/asset provenance; release notes.

**Optional later:** branded website, polished demo GIF, extensive SEO landing pages, conference talks, paid ads, package registry releases. A website cannot repair an unworkable first run.

## Monetization status and model assessment

Repository search found no Stripe integration, billing endpoints, subscriptions, checkout, payment webhooks, usage metering, organization plans, or license enforcement. Hosted deployment is not present. A Next.js app that can build is not an operating SaaS. Therefore current revenue mechanism: **none**.

| Model | Buyer / problem | Increment beyond OSS | Burden and sale difficulty | Low-cost test / fit |
|---|---|---|---|---|
| B: Productized AI cost audit | CTO/founder/finance-minded engineering lead unsure whether spend maps to workloads | Human-led data cleanup, reconciliation, scoped findings, readout and prioritized actions | Moderate analyst effort, trust/data handling; easiest initial paid test if scoped tightly | Offer one fixed scope against a redacted export. Price is a hypothesis; require purchase, not survey interest. Best first revenue candidate. Unsuitable if each audit becomes bespoke consulting with no repeatable method or verified savings. |
| E: Setup/integration support | Small team needs help mapping exports, workload keys, outcomes | Expert setup and bounded integration | Founder time and context switching; moderate sales friction | Sell one paid onboarding package with defined hours/deliverable. Fits current gaps but must not claim product automation. Unsuitable if it consumes all build capacity. |
| A/C: Hosted StackAudit/monitoring | Team that values continuity and does not want to operate DB/scheduler/secrets | Managed ingestion, auth, backups, retention, alerting, upgrades and reliability | High: multi-tenant isolation, secrets, provider operations, incidents, support, billing | First test by showing qualified teams self-host checklist vs managed-ops offer and asking for a paid pilot deposit/commitment. Do not build full SaaS until a team agrees to pilot. Currently blocked by security/ops gaps. |
| D: Agency allocation | Agency owner/finance/technical lead needing per-client AI cost reports | Client tenancy, project tagging, repeatable reports, export and access boundaries | Medium-high product/schema/security work and channel sales; customer data separation is essential | Interview agencies with actual invoices and sell a manually generated one-client report. Current product cannot safely support client tenants. Defer unless a paid client-specific commitment appears. |

Model priority: **B, with narrowly scoped E as delivery**, then test C with a paid design partner. Agency is a separate evidence question. “Hosted monitoring” cannot be responsibly sold before safe tenancy and operational controls.

## Four-week revenue validation

Run a small founder-led experiment; recruit through direct relationships and focused communities. Treat any price below as a **hypothesis to test**, not market data. Qualify teams with actual AI provider usage, a named buyer, and a recent cost question. Use synthetic/redacted exports initially; agree on handling and deletion before receiving customer data.

### Experiment 1 — Fixed-scope manual audit

- **Audience:** 5–8 small AI product teams with actual provider spend, including founders/CTOs who own cost decisions.
- **Recruitment:** targeted personal outreach and referrals; invite a 20-minute problem interview, then make a concrete offer to qualified teams.
- **Hypothesis:** they will pay to know spend by product workload and receive evidence-backed investigation priorities.
- **Offer:** a bounded review of one provider export plus workload map, documented assumptions/data gaps, and a 45-minute readout; no guarantee of savings.
- **Price hypothesis:** test one fixed fee in the low hundreds of USD equivalent, adjusted to founder/customer context; do not claim this is established market pricing. Ask for payment before work.
- **Evidence:** paid invoice/card payment, a usable export, and whether findings change an engineering/finance decision.
- **Success:** at least two unrelated qualified buyers pay and complete; one requests repeat monitoring or a second dataset. **Failure:** no one pays after 8 qualified offers, or data cannot be mapped without bespoke internal access.
- **Effort:** roughly 2–4 founder days over four weeks, hypothesis.
- **Next:** standardize a report/checklist if repeatable; otherwise interview on the blocker and narrow segment/scope.

### Experiment 2 — Paid design partner for continuous measurement

- **Audience:** 2–3 teams with recurring AI workload changes, a technical champion, and willingness to use a test/staging dataset.
- **Recruitment:** audit customers and direct startup outreach.
- **Hypothesis:** recurring completeness/change tracking is valuable enough to fund before a full hosted product exists.
- **Offer:** 4–6 week concierge pilot: weekly import/reconciliation, workload report, and anomaly review. Keep data handling explicit; can run in a customer-controlled environment.
- **Price hypothesis:** test a modest paid pilot fee (for example, a few hundred USD equivalent) or a signed paid conversion contingent on specific deliverables; amount is experimental.
- **Evidence:** signed pilot with payment/deposit or purchase order, recurring data access, and named weekly user.
- **Success:** one paid pilot completes two reporting cycles and renews/commits to a defined next period. **Failure:** interest but no access/payment, or operator work remains mostly manual and unrepeatable.
- **Effort:** 4–8 founder days; protect scope.
- **Next:** build only the repeated ingestion/reporting step the buyer funds.

### Experiment 3 — Hosted monitoring preference

- **Audience:** 5 qualified teams who can self-host or already operate a database/scheduler.
- **Recruitment:** show the same realistic OSS vs hosted operations comparison in audit calls.
- **Hypothesis:** some users will pay for managed persistence, ingestion continuity, backups, alert delivery and support rather than core formulas.
- **Offer:** mock but specific hosted service scope and service boundaries; ask for a paid design-partner commitment conditional on security milestones. Do not imply service exists.
- **Price hypothesis:** test a monthly managed-ops range with buyers; record their chosen commitment, not a survey preference.
- **Evidence:** signed conditional pilot or deposit and agreed security/data requirements.
- **Success:** at least one buyer commits money and supplies requirements that can be met economically. **Failure:** all choose self-host and no buyer commits after qualified demonstration.
- **Effort:** 1–2 founder days; no SaaS build.
- **Next:** if paid commitment exists, prepare architecture/security scope; if not, keep hosted on hold.

### Experiment 4 — Agency allocation

- **Audience:** 5 agencies with multiple active clients using AI in deliverables.
- **Recruitment:** direct referral/outreach; ask for one actual project example and current client billing process.
- **Hypothesis:** agency owners need a defensible client/project AI cost report and will pay for it.
- **Offer:** one manually produced client-level report using an authorized export and mapping worksheet.
- **Price hypothesis:** fixed report fee or pilot retainer, stated and paid before delivery; test an amount comparable to a small professional service engagement, not a claimed market rate.
- **Evidence:** paid report and permission to repeat for another client; measure hours to reconcile and disputes caused by attribution gaps.
- **Success:** two agencies pay and one repeats across a second client. **Failure:** no usable client tags/export, or agencies consider AI spend immaterial and refuse paid scope.
- **Effort:** 2–4 founder days.
- **Next:** only then model an explicit client entity and test isolation/report requirements. Do not build agency tenancy on verbal enthusiasm.

### Week-by-week schedule

| Week | Work | Decision evidence |
|---|---|---|
| 1 | Prepare a two-page audit offer, sample synthetic report, data-handling/deletion note, qualification criteria; contact 10 candidates | Qualified conversations and actual cost decision examples |
| 2 | Conduct interviews; make fixed-scope paid offers; collect one authorized redacted export | Paid acceptance vs polite interest; export shape/reconciliation burden |
| 3 | Deliver first paid audits; show hosted-vs-self-hosted operations card; recruit agencies | Payment, time-to-report, findings used, explicit hosted commitment |
| 4 | Run second cycle or agency report; review conversion, repeated work, failure reasons | Continue/narrow/stop decision; no star-count substitution |

Across experiments, define qualification before counting. An email signup, star, survey answer, positive quote, or “we would pay” is not payment validation. Signed commitment is stronger but still distinguish payment, access, repeat use, and renewal.

## Differentiation: claim versus evidence

| Candidate | Current evidence | Assessment |
|---|---|---|
| Multi-provider normalization | Two provider adapters and canonical event type | Real code, but ingestion not productized and live schemas/scopes unverified. |
| Workload attribution | API-key match rules and reconciliation tests | Potentially useful bridge between provider billing and product features; currently limited mapping channels. |
| Cost per outcome | Outcome endpoint and workload/outcome aggregate | Not a moat today: outcomes are caller-supplied counts and do not represent correctness, reversal, retries, review, or quality. Multiple outcome types receive unallocated workload cost per type. |
| Evidence-based audit | Deterministic rules/evidence and audit findings | More concrete than generic cost dashboards, but current rules are heuristics over recorded usage, not invoice truth. |
| Continuous monitoring/regression | Audit+monitor services and CRON_SECRET endpoint | The code exists; no managed scheduler, delivery service, or operational guarantee. |
| Developer-native integration | REST outcomes and adapters | No SDK/middleware/CLI/import UX; integration effort has not been measured. |
| Quality-aware outcome / rework / human intervention | Not represented in schema/service contract | Do not claim. |

Provider consoles show provider/account spend. Observability systems may show request traces and product analytics may show outcomes. The plausible StackAudit value is a self-hostable bridge that expresses spend by a team's own workload labels and highlights missing pricing/attribution. Whether users find that materially easier than combining existing tools is an experiment, not established differentiation.

Smallest integration improvement after preview: a robust canonical CSV import command/API with preview of unknown models, missing prices, duplicates and unattributed rows, plus one documented `POST /api/v1/outcomes` example. It can yield first cost-by-workload without asking customers to build an SDK. Add a TypeScript SDK only after teams ask for runtime instrumentation; defer Python, middleware, framework plugins, MCP, and GitHub Actions until usage evidence.

## Product boundary decisions

- **Free permanently:** pricing/cost engine, normalization contracts, import/export, workloads, attribution, outcomes, audits, basic dashboard, API, and basic self-hosted monitoring/alerts.
- **Hosted convenience:** operated database, secure credential lifecycle, scheduled ingestion, backups/retention, stable alert delivery, upgrades, and support. Sell reduced operational burden and continuity.
- **Potential paid later:** implementation, response commitments, advanced retention/SSO only when buyer evidence and cost structure justify them.
- **Defer:** billing/Stripe, forecast suite, enterprise controls, MCP, agency tenancy, broad SDK matrix, CI gating, and proprietary core intelligence.
- **Remove from roadmap unless paid evidence:** features justified only as arbitrary feature gates or generic “AI platform” breadth.

## Next 30 days: three priorities

1. **Make clean local demo work and verify it:** pricing fixture/provenance, empty-database seed, canonical CSV import, local auth mode; fresh clone run with migration/integration tests.
2. **Resolve the trust boundary:** define local single-user scope; eliminate first-org fallback. Before any shared deployment, complete auth/membership, RLS, secret handling, isolation tests and webhook review.
3. **Run the paid audit experiment:** make 8 qualified offers and attempt to close two paid fixed-scope audits; document data formats, labor and decisions affected. Use results to choose whether to improve import or stop.

Do not build billing, a managed multi-tenant service, forecasts, agency tenancy, quality-aware CPO, many SDKs, or marketing infrastructure yet. First validate a repeatable import and a paid problem.
