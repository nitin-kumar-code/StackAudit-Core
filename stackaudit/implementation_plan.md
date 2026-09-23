# Phase 9: V0 Dashboard & Frontend Experience Implementation Plan

## Overview
This phase builds the developer-focused V0 Dashboard for the AI Cost Intelligence platform. It will expose all backend capabilities (Phases 1-8) through a clean, technical interface using Next.js App Router, Shadcn/UI, and Tailwind.

## Open Questions / User Review Decisions
We have addressed three critical open questions prior to execution:

1. **Auth & Onboarding (A4 Fix)**: This is NOT deferred. Phase 9 will implement a secure onboarding route (`POST /api/v1/auth/setup-org` or a Server Action). When a new user logs in, if they lack an `app_metadata.organization_id`, they will be redirected to an onboarding screen. The backend will use the `SUPABASE_SERVICE_ROLE_KEY` to create the Organization and stamp the user's `app_metadata`, proving the A4 security boundary works.
2. **CPO Ambiguity (C6)**: Aggregation APIs and the UI will *never* sum CPO across different outcome types. The Dashboard KPI card will either pick the primary outcome type (if only one exists) or require a filter. The Outcomes Page and Workload Tables will list metrics explicitly *per outcome type* (e.g., `$0.21/ticket_resolved`, `$0.05/email_drafted`), pushing the C6 ambiguity clarity all the way to the glass.
3. **Demo Data Realism**: The `seed-demo-data.ts` script will deliberately inject dirty edge cases to verify backend resilience:
   * Unattributed usage (no `api_key_id`)
   * Unpriced events (simulating missing models)
   * A single workload generating *two different* outcome types (to test CPO ambiguity handling)
   * Mix of `OPEN` and `RESOLVED` audit findings and alerts

## Proposed Changes

### 1. New Aggregation APIs
To comply with the rule to keep business logic on the backend:
* `POST /api/v1/auth/setup-org`: Securely provisions new orgs and stamps `app_metadata`.
* `GET /api/v1/dashboard/summary`: Aggregates total cost, total usage, total outcomes, and active alerts over a time window.
* `GET /api/v1/dashboard/trends`: Aggregates daily/weekly cost, usage, and outcomes for the trend chart.
* `GET /api/v1/usage`: A paginated endpoint for the usage exploration page.

### 2. Application Shell & Navigation
* Modify `app/layout.tsx` to wrap the app with context providers (e.g., date range selection).
* Create `app/(app)/layout.tsx` for the persistent sidebar navigation.

### 3. Pages & Features
* **Onboarding (`/app/onboarding`)**: Intercepts users without an org and calls the secure setup route.
* **Dashboard (`/app/dashboard`)**: KPI Cards, Cost Trend Chart, Workload Economics Table, Recent Alerts.
* **Workloads (`/app/workloads` & `[id]`)**: List of workloads and detailed view.
* **Usage (`/app/usage`)**: Paginated data table of usage events with filters.
* **Outcomes (`/app/outcomes`)**: Analytics view showing Cost per Outcome strictly separated by Workload and Type.
* **Audits (`/app/audits`)**: Table of audit findings with detailed evidence view. Includes a "Run Audit" button.
* **Alerts (`/app/alerts`)**: Table of alerts with "Acknowledge" and "Resolve" actions.
* **Settings (`/app/settings`)**: Local config (Providers, Monitoring thresholds).

### 4. Verification Plan
1. **Typecheck & Lint**: `npx tsc --noEmit` and `npm run lint`.
2. **Build**: `npm run build` succeeds.
3. **Tests**: Run frontend Vitest suite covering the onboarding flow and CPO display.
4. **End-to-End**: Run `seed-demo-data.ts`, then start the app locally and verify the "FINAL VERIFICATION" user flow from the spec, specifically checking that the edge cases (unpriced, multi-type outcomes, resolved alerts) render correctly.
