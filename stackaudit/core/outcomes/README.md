# Phase 6: Outcome Ingestion & Analytics

This domain connects **AI Costs** to **Business Outcomes** to answer the fundamental question: *"How much does each completed business outcome cost in AI spend?"*

## Workload Cost Per Outcome Type (Unallocated)
The metric calculated here represents the **entire workload's AI spend** divided by the count of a **single outcome type**. 
*   **Important Caveat**: If a workload produces multiple outcome types (e.g. `ticket_resolved` AND `email_drafted`), each type's CPO calculation divides the *total workload cost* by its own count. This results in "unallocated" CPO. We do not automatically invent allocation percentages across different outcome types.
*   **Recommendation**: Workloads should ideally map to one primary outcome type, or users should understand that the cost is unallocated.

## Submission (Ingestion)
External applications submit outcomes via `POST /api/v1/outcomes`.
*   **Idempotency**: Submissions may provide an `idempotencyKey` to allow safe retries. If the key already exists for the workload:
    *   If the payload matches exactly, it returns `isDuplicate: true` (`200 OK`).
    *   If the payload differs (e.g. trying to change count with the same key), it strictly returns a `409 Conflict`.
*   **Organization Scoping**: Workloads and outcomes are strictly bound to the authenticated organization.

## Cost Per Outcome Calculation
The core formula:
`Cost Per Outcome = sum(usage_events.calculated_cost) / sum(outcome_events.count)`

**Semantics:**
*   **Unattributed Usage**: Usage that has not been mapped to a workload is entirely ignored.
*   **Zero Outcomes**: If AI spend exists but zero outcomes are recorded, `costPerOutcome` returns `null`.
*   **Zero Cost**: Returns `0`.
*   **Time Window & Timezones**: Follows the strict `[start, end)` half-open interval. Provider buckets are timestamped at bucket start (often UTC midnights). Queries dynamically align by explicitly truncating at `AT TIME ZONE 'UTC'`.
*   **Currency**: V0 calculation assumes `USD` natively.
*   **Overall Aggregation vs Daily Average**: The overall aggregate cost per outcome is `Total Cost / Total Outcomes`. We **never** average daily cost-per-outcome ratios.

## Data Completeness (Lag)
*   **Unpriced Events**: If a usage event failed pricing (e.g. missing catalog entry), it is skipped and tracked via `unpricedEventCount`.
*   **As Of**: The analytics result includes `asOf` (the maximum `captured_at` timestamp from the usage events in the period) to indicate the freshness of the data.
