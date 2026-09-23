# Phase 8: Continuous Monitoring & Alerts

Phase 8 builds upon the Audit Engine to execute it continuously in the background, comparing the current time window against the immediate previous comparable baseline window, and applying configurable alert policies.

## Architecture
```text
Usage Data -> Metric Aggregation -> Baseline Calculation -> Audit Engine -> Findings -> Alert Policy -> Alerts -> Webhook
```

## V0 Supported Metrics
*   `TOTAL_COST`
*   `USAGE_VOLUME`
*   `COST_PER_OUTCOME`
*   `INPUT_TOKENS_PER_REQUEST`
*   `OUTPUT_TOKENS_PER_REQUEST`
*   `TOTAL_TOKENS`
*   `MODEL_MIX`

## Execution
Run the monitoring suite per organization or globally across all enabled configurations:
```ts
const service = new MonitoringService(supabaseAdmin);
await service.runMonitoring(organizationId); // Returns Monitoring Run ID
```
A lightweight REST endpoint is exposed at `POST /api/v1/monitoring/run`. This should be triggered by an external cron (e.g. GitHub Actions, Vercel Cron, or OS Cron).

## Webhook Payload Example
```json
{
  "event": "ai_cost_alert",
  "alertId": "uuid-...",
  "severity": "HIGH",
  "category": "COST_DRIFT",
  "workload": "uuid-...",
  "title": "Disproportionate Cost Drift",
  "description": "...",
  "evidence": {
    "metric": "unit_cost_drift",
    "baseline": 1.25,
    "observed": 2.10,
    "changePercent": 68.0
  },
  "timestamp": "2026-09-21T00:00:00.000Z"
}
```

## Alert Lifecycle
*   `OPEN` - A new anomaly triggered an alert.
*   `ACKNOWLEDGED` - An operator recognized the anomaly (via API `POST /api/v1/alerts/:id/acknowledge`).
*   `RESOLVED` - The anomaly is no longer present in the latest monitoring run, or manually resolved.

## Limitations
*   No Machine Learning / Neural Anomaly detection. (Explainable boundaries only).
*   No guaranteed savings estimates.
*   Incomplete usage data will strictly skip anomaly detection to prevent false positives.
