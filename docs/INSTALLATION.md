# Installation and Setup Guide

This guide walks you through setting up a complete local development and preview environment for **StackAudit**.

---

## System Requirements & Prerequisites

Before installing StackAudit, ensure your system has the following tools installed and running:

| Requirement | Minimum Version | Notes |
| :--- | :--- | :--- |
| **Node.js** | `>= 22.22.2` | Engine requirement enforced by `package.json` |
| **npm** | `>= 10.0.0` | Included with modern Node.js distributions |
| **Docker** | Latest Desktop / Engine | Required to run the local Supabase Postgres instance |
| **Git** | `>= 2.30.0` | Required to clone the repository |

> [!NOTE]
> The Supabase CLI is locked in `package-lock.json` and runs via `npx supabase`. You do not need to install it globally.

---

## Step-by-Step Installation

### 1. Clone the Repository

```bash
git clone https://github.com/nitin-kumar-code/StackAudit-Core.git
cd StackAudit-Core/stackaudit
```

> [!IMPORTANT]
> All application commands, tests, and build scripts are executed from within the `stackaudit/` directory.

### 2. Install Node.js Dependencies

Install the locked dependency tree using `npm ci`:

```bash
npm ci
```

### 3. Start Local Supabase Containers

StackAudit uses a local Supabase stack (PostgreSQL, PostgREST, and GoTrue). Ensure **Docker Desktop** is open and running, then start the local database:

```bash
npx supabase start
```

Once started, retrieve the local credentials:

```bash
npx supabase status
```

You will see output resembling:
```text
API URL: http://127.0.0.1:54321
GraphQL URL: http://127.0.0.1:54321/graphql/v1
DB URL: postgresql://postgres:postgres@127.0.0.1:54322/postgres
Studio URL: http://127.0.0.1:54323
Inbucket URL: http://127.0.0.1:54324
anon key: eyJhbGciOi...
service_role key: eyJhbGciOi...
```

### 4. Configure Environment Variables

Create your local environment file:

```bash
cp .env.example .env.local
```

Open `.env.local` and fill in the `SUPABASE_SERVICE_ROLE_KEY` from the previous step:

```ini
# Database & API Endpoint
STACKAUDIT_DATABASE_MODE=local
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_SERVICE_ROLE_KEY=<service_role_key_from_supabase_status>

# Workspace Scope (pre-configured for demo seed)
STACKAUDIT_WORKSPACE_ORG_ID=8a775c7f-e31c-8f9b-9000-000000000001

# Demo Dataset Parameters (optional overrides)
DEMO_SEED=12345
DEMO_DATASET_DAYS=90
```

> [!CAUTION]
> The `SUPABASE_SERVICE_ROLE_KEY` has administrative access and bypasses RLS. Keep it strictly inside `.env.local`. Never commit it to git or prefix it with `NEXT_PUBLIC_`.

### 5. Apply Database Migrations

Initialize the database schema from the ordered migration history:

```bash
npx supabase db reset
```

This ensures a clean, validated schema matching the committed migration set in `supabase/migrations/`.

### 6. Load Pricing Fixtures & Demo Dataset

Run the automated setup script to load reference token pricing fixtures (OpenAI & Anthropic) and seed 90 days of deterministic usage, workloads, outcomes, and audit findings:

```bash
npm run setup
```

*(Alternatively, you can run `npm run pricing:load` followed by `npm run seed`).*

### 7. Start Development Server

```bash
npm run dev
```

Visit **[http://localhost:3000](http://localhost:3000)** in your browser. You will be greeted by the StackAudit dashboard with populated spend trends, workload unit economics, and anomaly alerts!

---

## Verification & Health Check

To verify your installation is running correctly:

```bash
# 1. Verify TypeScript types
npm run typecheck

# 2. Run unit tests
npm test

# 3. Run Supabase integration tests
npm run test:integration
```

---

## Common Troubleshooting

### `Docker API connect error` / `Cannot connect to Docker daemon`
- **Cause**: Docker Desktop is not running.
- **Fix**: Launch Docker Desktop and wait until the whale icon in your menu bar shows "Engine running", then rerun `npx supabase start`.

### `ETIMEDOUT` or `Operation timed out` on macOS
- **Cause**: Project placed inside `~/Documents` or `~/Desktop` with iCloud Drive sync active, causing files to become "dataless" placeholders.
- **Fix**: Move the repository to a non-synced folder (e.g. `~/Development/StackAudit-Core`) and ensure free disk space > 10 GB.

### `The pricing catalog has no OpenAI or Anthropic records`
- **Cause**: Setup ran without loading the reference pricing catalog.
- **Fix**: Run `npm run pricing:load`.

### `relation "organizations" does not exist`
- **Cause**: Migrations were not applied to the local database.
- **Fix**: Run `npx supabase db reset`.

### `Last 7 Days shows $0.00 on Dashboard`
- **Cause**: `DEMO_DATASET_END` was set to a fixed date in the past.
- **Fix**: Ensure `DEMO_DATASET_END` is commented out in `.env.local` so the dataset terminates at today's UTC midnight, then run `npm run seed`.
