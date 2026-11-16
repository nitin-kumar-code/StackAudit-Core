# Changelog

All notable changes to **StackAudit** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.1.0] - 2026-11-15

### Initial Open-Source Developer Preview (V0)

Welcome to the initial developer preview release of StackAudit! This release provides an open-source, local-first platform for tracking AI model spending, attributing costs to business workloads, and calculating the true cost of producing business outcomes.

### Added

#### Core Cost & Pricing Engine
- **Canonical Usage Event Model**: Standardized schema across AI providers (OpenAI, Anthropic) capturing input, output, and prompt caching tokens (read & creation).
- **Effective-Dated Pricing Catalog**: Reference pricing engine with versioned rate cards, temporal effective ranges `[effective_from, effective_until)`, and unpriced event detection.
- **Arbitrary-Precision Currency Math**: Full financial calculation pipeline powered by `big.js`, eliminating floating-point rounding errors on sub-cent token rates.

#### Workload Attribution & Unit Economics
- **Dynamic Attribution Rules**: Attribution mapping linking provider API key identifiers to business workloads.
- **Cost Per Outcome (CPO) Engine**: Unit economics tracking calculating the real monetary cost per business outcome (e.g., customer ticket resolved, document extracted, user onboarded).
- **Unattributed Usage Tracking**: Clear separation and auditing of unmapped AI expenditures.

#### Audit Findings & Monitoring Alerts
- **Evidence-Based Auditing**: Automated detection across four heuristic categories:
  - `USAGE_SPIKE`: Sudden surges in token volume or request frequencies.
  - `COST_DRIFT`: Sustained baseline expenditure creep.
  - `TOKEN_EFFICIENCY`: Disproportionate output or input token consumption.
  - `MODEL_MIX`: Unintended shifts toward premium model tiers.
- **Alert Lifecycle Management**: Deterministic alert fingerprinting supporting Open, Acknowledge, and Resolve workflows.

#### Web Interface & Visualizations
- **Next.js 16 (App Router) & React 19 Dashboard**: Fast, responsive web UI built with Tailwind CSS, Lucide icons, and shadcn/ui primitives.
- **Usage Explorer**: Filterable usage ledger with time range intervals, provider/model filters, and server-side pagination.
- **Interactive Recharts Visualizations**: Daily spend trends, cumulative cost curves, and workload distribution breakdowns.
- **Canonical CSV Importer**: Web-based bulk usage ingestion supporting custom exports from OpenAI and Anthropic console reports.

#### Infrastructure & Developer Experience
- **Supabase & Postgres Integration**: Complete schema migration history (`supabase/migrations/`) with high-performance server-side aggregation RPCs.
- **Deterministic 90-Day Demo Seeder**: One-command reproducible test scenario (`npm run setup`) generating 90 days of synthetic usage, workloads, outcomes, and active alerts.
- **Comprehensive Test Suite**: Vitest unit testing and real Supabase integration test suites for aggregation math, attribution, and API endpoints.
- **Automated CI Workflow**: GitHub Actions pipeline validating TypeScript types, ESLint rules, unit tests, and production builds.

### Security & Hardening
- **Single-User Local Trust Boundary**: Explicit local preview architecture strictly binding the service role to `localhost`.
- **Database Row Level Security (RLS)**: Enforced across all operational tables with revoked `anon` and `PUBLIC` browser roles.
- **Zero Provider Credential Storage**: StackAudit V0 does not collect, prompt for, or store third-party provider API keys.
