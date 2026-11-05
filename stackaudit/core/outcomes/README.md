# Phase 6: Outcome Ingestion & Analytics

This domain connects **AI Costs** to **Business Outcomes** to answer the fundamental question: *"How much does each completed business outcome cost in AI spend?"*

## Workload Cost Per Outcome Type
Cost per outcome is available only when exactly one outcome type is recorded for a workload in the selected window. With multiple types, the workload's full spend cannot be defensibly assigned to one type, so CPO is `null` with an availability reason. Daily series applies the same rule per day.

## Submission (Ingestion)
External applications submit outcomes via `POST /api/v1/outcomes`.
*   **Idempotency**: Submissions may provide an `idempotencyKey` to allow safe retries. If the key already exists for the workload:
    *   If the payload matches exactly, it returns `isDuplicate: true` (`200 OK`).
    *   If the payload differs (e.g. trying to change count with the same key), it strictly returns a `409 Conflict`.
*   **Organization Scoping**: Workloads and outcomes are strictly bound to the authenticated organization.

## Cost Per Outcome Calculation
The core formula:
`Cost Per Outcome = complete priced cost for one workload / its sole outcome type count`

**Semantics:**
*   **Unattributed Usage**: Usage that has not been mapped to a workload is entirely ignored.
*   **Scope**: Costs and outcomes are matched to the same organization, workload, and `[start, end)` window. Unattributed usage is not included. CPO requires exactly one outcome type in that scope.
*   **Incomplete pricing**: `knownCost` contains only priced events; `totalCost` and `costPerOutcome` are `null` when any event in that workload and window is unpriced. `unpricedEventCount` discloses the missing coverage.
*   **Zero Outcomes**: If AI spend exists but zero outcomes are recorded, `costPerOutcome` returns `null`.
*   **Zero Cost**: Returns `0`.
*   **Time Window & Timezones**: Follows the strict `[start, end)` half-open interval. Provider buckets are timestamped at bucket start (often UTC midnights). Queries dynamically align by explicitly truncating at `AT TIME ZONE 'UTC'`.
*   **Currency**: V0 calculation assumes `USD` natively.
*   **Overall Aggregation vs Daily Average**: The overall aggregate cost per outcome is `Total Cost / Total Outcomes`. We **never** average daily cost-per-outcome ratios.

## Data Completeness (Lag)
*   **Unpriced Events**: If a usage event failed pricing (e.g. missing catalog entry), its stored zero placeholder is excluded from known cost and tracked via `unpricedEventCount`.
*   **As Of**: The analytics result includes `asOf` (the maximum `captured_at` timestamp from the usage events in the period) to indicate the freshness of the data.
