# Phase 7: AI Cost Audit Engine

The Audit Engine evaluates AI usage and generates **evidence-backed** findings (anomalies, inefficiencies, shifts). It does not guess, fabricate savings, or execute unauthorized automated actions.

## Categories Supported
*   `USAGE_SPIKE`: Identifies unusually high usage volume compared to a deterministic baseline.
*   `COST_DRIFT`: Triggers when cost increases disproportionately to usage or outcome volume (i.e. spending more per unit of value).
*   `TOKEN_EFFICIENCY`: Triggers when the average number of tokens consumed per request surges.
*   `MODEL_MIX`: Flags significant shifts in model preference distribution.

## Pure Function Rules
Rules (e.g. `UsageSpikeRule`) are designed as pure functions implementing the `AuditRule` interface. They accept an aggregated `AuditContext` and return an `AuditFinding` object or `null`. They contain zero database logic and perform no side-effects, keeping the engine thoroughly testable.

## Baseline Methodology
V0 Baseline strictly uses the chronological period immediately preceding the requested window, matching the exact duration in length.

## Thresholds
Constants defining sensitivity (e.g., minimum sample size = 50, cost drift > 30%) are centrally located in `core/audit/thresholds.ts` for simple operator tuning without crawling magic numbers.

## Duplicate Prevention
Findings map to a deterministic signature: `(organization_id, workload_id, category, time_window_start, time_window_end)`.
Repeated audits safely update evidence rather than spawning massive redundant alerts.

## Limitations & Invoice Verification
*   V0 does **not** perform independent invoice reconciliation. Finding an anomaly here does not automatically mean a provider overcharged you. 
*   True bill reconciliation requires parsing raw provider invoice drops which belongs to a future lifecycle phase.
