# Hardening Pass Complete

The correctness and security pass over Phases 4-8 is fully implemented.

## Changes Completed by Group

### Group A — Security
* **A1 (Cron Auth):** Created an internal `POST /api/v1/internal/monitoring/run` endpoint using a `CRON_SECRET` strictly scoped to the configured workspace (`STACKAUDIT_WORKSPACE_ORG_ID`), removed `runMonitoring(undefined)` capability from user routes, and added in-memory rate limiting to `POST /api/v1/monitoring/run`.
* **A2 (Webhook SSRF):** Completely rewrote `WebhookChannel.send`. Validates URLs by resolving DNS and explicitly blocking private (RFC 1918), loopback, link-local, and unspecified IPs. Applies 10s `AbortSignal.timeout`.
* **A3 (Webhook Encryption):** Implemented AES-256-GCM encryption in `lib/crypto.ts`. Webhook secrets are now decrypted on-the-fly inside `WebhookChannel` prior to HMAC signing.
* **A4 (app_metadata provenance):** Verified Supabase's client-side restrictions and added `lib/__tests__/auth.test.ts` as a security assertion to document that the architecture is safe by design.

### Group B — Data Correctness
* **B2 (requestCount semantics):** Updated `core/providers/openai.ts` to forward the actual `n_requests` instead of defaulting to 1. Added `requestCount: 0` to Anthropic adapter to explicitly signal its absence. Mapped `request_count` in `core/usage/ingestion.ts` upsert.
* **B4 (Re-pricing path):** Verified `core/usage/ingestion.ts` handles `calculated_cost = EXCLUDED.calculated_cost` correctly due to Supabase's default row replacement on conflict.
* **B5 (Sync watermark):** Clamped the effective query window in `AuditService.runAudit` to the `last_ingested_bucket_end` in the `provider_sync_state` table. Added watermark warnings to low-confidence findings when the watermark is stale.

### Group C — Audit Engine
* **C3 (Stale finding resolution):** Implemented an auto-resolve routine in `AuditService.persistFindings`. Any previously OPEN findings for the window that did not fire in the current evaluation are now marked as RESOLVED.
* **C6 (CPO semantics):** Updated the `CostPerOutcomeResult` type with `costAllocationNote` and returned it from `OutcomeService.getCostPerOutcome`, explicitly communicating that costs are unallocated across multiple outcome types.

### Group D — Monitoring/Alerts
* **D1 (Atomic alert upsert):** Replaced `.single()` race condition with a secure `upsert_alert` SQL RPC.
* **D2 (Escalation notifications):** `AlertService.processFinding` now tracks `last_notified_severity` to determine if a severity escalation warrants a new notification.
* **D4 (Webhook retry):** `AlertService.retryFailedNotifications` acts as a sweep, picking up alerts with `notified_at IS NULL` under a max attempt count limit.
* **D3, D5, D6, D7 (Monitoring Lifecycle):** Auto-resolves using `rulesEvaluated`, tracks expanded states (`COMPLETED_WITH_ERRORS`), reaps stale runs via `reapStaleRuns()`, and caps historical window evaluations.

## Testing & Verification
I ran a full suite of typechecks (`npx tsc --noEmit`) and unit tests (`npm run test:unit`) which all passed successfully.

**Action Required:**
Because the Sandbox environment lacks a Docker engine, `supabase start` cannot be executed, which blocks the execution of `test:integration`. I have fully prepared `core/monitoring/__tests__/integration.test.ts` to validate the alert lifecycle.

Please run the integration test suite in your local Docker-enabled environment (or CI) by executing:
```bash
npm run test:integration
```
If you encounter any DB permission or schema mismatches in the tests, please let me know. We are now ready to proceed to Phase 9.
