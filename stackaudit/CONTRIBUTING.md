# Contributing to StackAudit

Thank you for your interest in contributing to StackAudit! We are building an open-source AI cost intelligence platform designed to bring financial clarity and workload attribution to AI engineering teams.

Whether you are fixing a bug, improving documentation, adding new provider pricing fixtures, or refining unit economics metrics, your help is welcome.

---

## Code of Conduct

All contributors and participants are expected to adhere to our [Code of Conduct](CODE_OF_CONDUCT.md). Please treat everyone with respect and kindness.

---

## Development Workflow

### Prerequisites

- **Node.js**: `22.22.2+` and `npm`
- **Docker**: Docker Desktop or a running Docker daemon (required for local Supabase)
- **Supabase CLI**: Automatically available via `npx supabase` after running `npm ci` inside `stackaudit/`

### 1. Fork and Clone

```bash
git clone https://github.com/<your-username>/Ai-spend-audit.git
cd Ai-spend-audit/stackaudit
```

### 2. Install Dependencies

```bash
npm ci
```

### 3. Configure Local Environment

Copy `.env.example` to `.env.local`:
```bash
cp .env.example .env.local
```

Start the local Supabase container:
```bash
npx supabase start
```

Update `.env.local` with the values printed by `npx supabase status`:
```ini
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
STACKAUDIT_DATABASE_MODE=local
SUPABASE_SERVICE_ROLE_KEY=<service_role_key_from_status>
STACKAUDIT_WORKSPACE_ORG_ID=8a775c7f-e31c-8f9b-9000-000000000001
```

### 4. Setup Database Schema and Demo Data

Apply database migrations:
```bash
npx supabase db reset
```

Load reference pricing fixtures and seed deterministic demo data:
```bash
npm run setup
```

Start the development server:
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) to view your local instance.

---

## Engineering Guidelines & Standards

To ensure mathematical precision, security, and maintainability across the codebase:

### 1. Financial & Currency Mathematics
- **Never use standard JavaScript floating-point numbers (`number`) for financial costs or token rates.**
- Always use **`big.js`** for cost calculations, division, multiplication, and rounding:
  ```typescript
  import Big from "big.js";
  const cost = new Big(tokens).div(1_000_000).times(ratePerMillion);
  ```
- Store and serialize monetary amounts as exact decimal strings (e.g., `"12.450000"`), never floats.

### 2. Database Migrations
- The schema is managed exclusively via Supabase migrations in `stackaudit/supabase/migrations/`.
- **Never modify existing or already-committed migration files.**
- Always create a new sequential forward migration:
  ```bash
  npx supabase migration new <migration_name>
  ```
- Keep all aggregation RPCs and queries scoped to the active workspace organization ID.

### 3. V0 Trust Boundary & Provider Isolation
- Do **not** add automated third-party provider scraping, background credential storage, or live credential prompts to V0.
- Usage ingestion should adhere to the canonical schema (`CanonicalUsageEvent`) via CSV import or sanitized API endpoints.
- Maintainers and reviewers will reject changes that introduce hardcoded external credentials or compromise the local-first isolation model.

### 4. Type Safety and Code Style
- Strict TypeScript: Avoid `any` types; prefer explicit types and Zod validation schemas.
- ESLint: Ensure no warnings or errors remain before submitting.
- Component styling: Built on Tailwind CSS and shadcn/ui primitives.

---

## Verification & Testing

Before submitting a Pull Request, verify that all test suites pass:

```bash
# Inside stackaudit/ directory:

npm run typecheck         # Verify TypeScript types
npm run lint              # Run ESLint linter
npm test                  # Run Vitest unit tests
npm run test:integration  # Run database integration tests (requires local Supabase running)
npm run build             # Verify Next.js production build succeeds
```

---

## Submitting Pull Requests

1. **Create a descriptive branch**:
   - `feat/add-claude-3-5-haiku-pricing`
   - `fix/csv-import-timestamp-parsing`
   - `docs/clarify-cpo-calculation`
2. **Commit Messages**: Follow [Conventional Commits](https://www.conventionalcommits.org/):
   - `feat(pricing): add Q4 2024 reference pricing fixtures`
   - `fix(usage): handle ISO timestamps with timezone offsets`
   - `docs(readme): add troubleshooting section for docker engine`
3. **Open a Pull Request**:
   - Fill out the provided [Pull Request Template](.github/pull_request_template.md).
   - Link any related GitHub issues (`Fixes #123`).
   - Include screenshots or terminal output demonstrating your verification.

---

## Community & Questions

- Have a question or idea? Open a [GitHub Discussion](https://github.com/nitin-kumar-code/Ai-spend-audit/discussions).
- Found a bug? File a detailed report using the [Bug Report Template](.github/ISSUE_TEMPLATE/bug_report.yml).
- Security concerns? Please follow [SECURITY.md](SECURITY.md) for private reporting.
