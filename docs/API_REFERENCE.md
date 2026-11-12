# StackAudit API reference

This reference describes the handlers currently implemented under `app/api/v1`. The API is part of StackAudit V0's **single-user local preview**; it is not an authenticated shared service. All URLs below are relative to the application's origin and use the `/api/v1` prefix.

## Access, headers, and errors

The browser calls StackAudit's Next.js server. It does not connect directly to Supabase. Standard endpoints scope all reads and writes to the organization configured in `STACKAUDIT_WORKSPACE_ORG_ID`. Requests cannot supply an organization selector.

In local preview, `Authorization` may be omitted. A request without it acts as the one local operator. If supplied, it must be `Bearer <Supabase access token>`; the server verifies the token and requires `user.app_metadata.organization_id` to equal the configured workspace. There is no StackAudit login/session flow. Anyone who can reach the app can use it as the operator; keep it on a trusted local interface. An invalid token returns `401`; a missing/invalid workspace configuration or mismatched organization returns `403`.

For JSON request bodies send `Content-Type: application/json`. Errors normally use `{"error":"message"}`. CSV import uses `multipart/form-data`. Successful deletes return `204` with an empty body. The service-role key is server-only and is never an API request credential.

Date ranges used by analytics are half-open **`[start, end)`**: the start is included and the end is excluded. All ranges are limited to 366 days unless stated otherwise. Times are parsed by JavaScript `Date` and converted to ISO UTC before database queries. Dashboard and outcomes aggregation groups daily values by UTC day.

There are no route-level Zod schemas in this API; handlers and services validate inputs manually. Error status behavior below reflects the current handlers; malformed JSON may still become `500` on handlers that do not catch parse errors.

## Usage

### `GET /api/v1/usage`

Reads a page of usage events and whole-filter-range totals for the configured workspace.

| Query | Required | Rules |
|---|---:|---|
| `start`, `end` | Yes | Parseable dates; start must precede end; at most 366 days |
| `page` | No | Positive integer, default `1`, max `1,000,000` |
| `limit` | No | Positive integer, default `50`, max `100` |
| `provider`, `model` | No | Exact match; omitted, empty, or `all` means no filter; trimmed value up to 255 characters |
| `workloadId` | No | UUID; omitted, empty, or `all` means all workloads; filters to events attributed by current rules |

Events sort newest-first by `(timestamp, id)`. Filters apply before pagination. `summary` and `filters` cover the whole filtered range, even if the selected page is empty. The response event fields are database row fields in `snake_case`, plus derived `workload_id` and `workload_name`; `calculated_cost` is serialized as a decimal string.

```sh
curl 'http://localhost:3000/api/v1/usage?start=2026-11-01T00%3A00%3A00Z&end=2026-11-08T00%3A00%3A00Z&page=1&limit=50'
```

```json
{
  "events": [{
    "id": "10000000-0000-4000-a000-000000000001",
    "organization_id": "8a775c7f-e31c-8f9b-9000-000000000001",
    "provider": "openai",
    "model": "gpt-example",
    "timestamp": "2026-11-03T12:00:00+00:00",
    "input_tokens": 1200,
    "output_tokens": 240,
    "cache_read_tokens": 100,
    "cache_creation_tokens": 0,
    "provider_reference": "export-row-001",
    "api_key_id": "support-key",
    "calculated_cost": "0.0042",
    "is_unpriced": false,
    "request_count": 1,
    "raw_response_hash": "sha256-hex-digest",
    "captured_at": "2026-11-03T12:01:00+00:00",
    "updated_at": "2026-11-03T12:01:00+00:00",
    "reprice_attempts": 0,
    "workload_id": "20000000-0000-4000-a000-000000000001",
    "workload_name": "Support triage"
  }],
  "summary": {
    "totalRequests": 1,
    "totalTokens": 1440,
    "totalCost": "0.0042",
    "knownCost": "0.0042",
    "isCostComplete": true,
    "pricedEventCount": 1,
    "unpricedEventCount": 0,
    "totalEvents": 1
  },
  "filters": { "providers": ["openai"], "models": ["gpt-example"], "workloads": [{"id":"20000000-0000-4000-a000-000000000001","name":"Support triage"}] },
  "pagination": { "page": 1, "limit": 50, "total": 1, "totalPages": 1 }
}
```

`totalCost` is `null` when any matching event is unpriced. `knownCost` is the subtotal of priced events and is `null` when the range contains only unpriced events. Cache token columns are breakdowns of input tokens and are not added again to `totalTokens`.

Errors: `400` invalid/missing range, page, limit, or filter; `401` invalid bearer token; `403` invalid workspace/membership; `500` database or server error.

### `POST /api/v1/usage/import`

Imports canonical usage CSV from a multipart form field named `file`. No provider credential is accepted or required. Maximum upload is 5 MiB and 10,000 data rows. Header names are trimmed and case-insensitive; duplicate or unsupported columns and missing required headers reject the header (`400`). Data rows validate independently, so a response may be partial.

Required headers: `provider,model,timestamp,input_tokens,output_tokens,provider_reference`.

Optional headers: `cache_read_tokens,cache_creation_tokens,request_count,api_key_id`.

`timestamp` must be ISO 8601 with a timezone. Token/request counts must be non-negative safe whole numbers. A blank optional count defaults to zero, except `request_count`, which becomes one. `provider`, `model`, and `provider_reference` must be non-empty. Provider is lowercased; `api_key_id` is matched against attribution rules. The first duplicate `(provider, provider_reference)` in one file is retained; duplicate rows in that file are reported as rejected. Previously stored references are skipped and counted in `duplicates`. New rows use the shared pricing and attribution path; unpriced rows are imported with `is_unpriced=true` and reported.

```sh
curl -F 'file=@usage.csv;type=text/csv' http://localhost:3000/api/v1/usage/import
```

```json
{
  "validated": 2,
  "accepted": 1,
  "rejected": 1,
  "imported": 1,
  "duplicates": 0,
  "unpriced": 0,
  "errors": [{ "row": 3, "message": "input_tokens must be a non-negative whole number." }],
  "message": "1 rows imported; 0 imported without matching pricing."
}
```

Status is `200` when all rows complete without row errors and `207` when some rows are rejected or database batch writes fail. `400` covers missing file/header/CSV structure; `401`/`403` access errors; `413` file/row limit; `503` failure to read the database/catalog. A database failure reports affected source row numbers and does not silently count the batch as accepted. The import endpoint checks for existing references before ingesting; the database uniqueness key is `(organization_id, provider, provider_reference)`. The ingestion service upserts that key, so simultaneous imports of the same reference can update the existing row rather than create a second one.

## Outcomes and cost-per-outcome

### `POST /api/v1/outcomes`

Adds a workload outcome count. JSON fields: `workloadId` UUID, `outcomeType` non-empty (max 255), `timestamp` parseable date no more than one day in the future, `count` positive integer, optional `metadata` JSON (max 10 KiB when serialized), optional `idempotencyKey` max 255 characters. Unknown body properties are rejected. The workload must exist in the active workspace.

Use the same `idempotencyKey` when retrying an outcome submission. Matching workload/key and matching count/type returns the existing event with `200` and `isDuplicate: true`; the service does not compare timestamp or metadata for this retry. A new event returns `201`. Reusing the key with different count/type returns `409 Conflict`. The database key is unique per organization, while the service's duplicate lookup also filters by workload; reusing one key on a different workload can still surface as a database error.

```sh
curl -X POST http://localhost:3000/api/v1/outcomes \
  -H 'Content-Type: application/json' \
  -d '{"workloadId":"20000000-0000-4000-a000-000000000001","outcomeType":"ticket_resolved","timestamp":"2026-11-03T12:00:00Z","count":3,"idempotencyKey":"ticket-batch-2026-11-03"}'
```

```json
{"data":{"id":"30000000-0000-4000-a000-000000000001","organizationId":"8a775c7f-e31c-8f9b-9000-000000000001","workloadId":"20000000-0000-4000-a000-000000000001","outcomeType":"ticket_resolved","timestamp":"2026-11-03T12:00:00.000Z","count":3,"metadata":null,"idempotencyKey":"ticket-batch-2026-11-03"},"isDuplicate":false}
```

Errors: `400` validation/unknown field; `401`/`403` access; `404` workload not found; `409` idempotency payload conflict; `500` database/server error.

### `GET /api/v1/outcomes`

Returns cost-per-outcome summaries grouped by workload and outcome type. Required query parameters: `start`, `end`; dates must parse, start precedes end, and span is at most 366 days. Aggregation uses the active workspace and `[start,end)`.

```sh
curl 'http://localhost:3000/api/v1/outcomes?start=2026-11-01T00%3A00%3A00Z&end=2026-11-08T00%3A00%3A00Z'
```

```json
{"data":[{"workloadId":"20000000-0000-4000-a000-000000000001","workloadName":"Support triage","outcomeType":"ticket_resolved","startTime":"2026-11-01T00:00:00.000Z","endTime":"2026-11-08T00:00:00.000Z","totalCost":"0.42","knownCost":"0.42","isCostComplete":true,"pricedEventCount":12,"totalOutcomeCount":7,"costPerOutcome":"0.06","unpricedEventCount":0,"availabilityReason":null,"currency":"USD","costAllocationNote":"Uses the workload total divided by its sole outcome type in this window; this is an average ratio, not a causal or per-request cost allocation."}]}
```

Incomplete pricing makes `totalCost` and CPO `null`; no outcomes also makes CPO `null`; multiple outcome types in a workload/window withhold CPO. Costs include only usage attributed to that workload. Errors: `400` invalid range; `401`/`403`; `500` database/server error.

### `GET /api/v1/analytics/cost-per-outcome`

Requires `workloadId`, `outcomeType`, `startTime`, and `endTime`. Add `series=true` to return daily points; otherwise returns one aggregate. Dates must parse; supported analytics range is at most 366 days and workload ID must be a UUID (enforced by the service).

```sh
curl 'http://localhost:3000/api/v1/analytics/cost-per-outcome?workloadId=20000000-0000-4000-a000-000000000001&outcomeType=ticket_resolved&startTime=2026-11-01T00%3A00%3A00Z&endTime=2026-11-08T00%3A00%3A00Z&series=true'
```

```json
{"data":[{"periodStart":"2026-11-01T00:00:00.000Z","periodEnd":"2026-11-02T00:00:00.000Z","totalCost":"0.12","knownCost":"0.12","isCostComplete":true,"pricedEventCount":4,"outcomeCount":2,"costPerOutcome":"0.06","unpricedEventCount":0,"availabilityReason":null}]}
```

Without `series=true`, `data` is the `GET /outcomes` cost result shape (without `workloadName`). Daily series returns UTC calendar points, including empty days. Errors: `400` missing fields, invalid dates/UUID, reversed range, or range over 366 days; `401`/`403` access; `500` aggregation error.

## Workloads and attribution

### `GET /api/v1/workloads`

Lists all workloads in the active workspace. No query parameters or pagination.

```sh
curl http://localhost:3000/api/v1/workloads
```

```json
{"workloads":[{"id":"20000000-0000-4000-a000-000000000001","organizationId":"8a775c7f-e31c-8f9b-9000-000000000001","name":"Support triage","description":null,"createdAt":"2026-11-01T10:00:00.000Z"}]}
```

Errors: `401`/`403`; `500` database/server error.

### `POST /api/v1/workloads`

Creates a workload. Body: `name` (non-empty string) and optional `description` (string). Organization is assigned from local configuration; caller cannot choose it. Unknown fields are ignored by this handler.

```sh
curl -X POST http://localhost:3000/api/v1/workloads -H 'Content-Type: application/json' -d '{"name":"Support triage","description":"Customer support AI flow"}'
```

```json
{"data":{"id":"20000000-0000-4000-a000-000000000001","organizationId":"8a775c7f-e31c-8f9b-9000-000000000001","name":"Support triage","description":"Customer support AI flow","createdAt":"2026-11-01T10:00:00.000Z"}}
```

Returns `201`; `400` empty name; `401`/`403`; `500` database/server error. No idempotency key or pagination.

### `GET /api/v1/workloads/{id}`

Reads one workload in the active workspace. `id` is a path UUID in practice; existence is looked up within the workspace.

```sh
curl http://localhost:3000/api/v1/workloads/20000000-0000-4000-a000-000000000001
```

```json
{"workload":{"id":"20000000-0000-4000-a000-000000000001","organizationId":"8a775c7f-e31c-8f9b-9000-000000000001","name":"Support triage","description":null,"createdAt":"2026-11-01T10:00:00.000Z"}}
```

Errors: `401`/`403`, `404` unknown/out-of-workspace workload, `500` database/server error.

### `PATCH /api/v1/workloads/{id}`

Updates supplied `name` and/or `description`; name must be a non-empty string, description must be string or `null`, and unknown fields are rejected. An empty object is not explicitly rejected and can be reported as `404` because service errors/no returned row are mapped to not found.

```sh
curl -X PATCH http://localhost:3000/api/v1/workloads/20000000-0000-4000-a000-000000000001 -H 'Content-Type: application/json' -d '{"description":"Updated process description"}'
```

```json
{"data":{"id":"20000000-0000-4000-a000-000000000001","organizationId":"8a775c7f-e31c-8f9b-9000-000000000001","name":"Support triage","description":"Updated process description","createdAt":"2026-11-01T10:00:00.000Z"}}
```

Errors: `400` invalid/unknown field, `401`/`403`, `404` unknown/out-of-workspace workload, `500` database/server error.

### `DELETE /api/v1/workloads/{id}`

Deletes the workload; database cascades remove its attribution rules and monitoring config/alerts, while outcome rows keep their history with `workload_id=NULL`. Usage attribution is derived from rules and is not stored as a workload foreign key. No request body. The handler returns `204` with no body; it does not distinguish an absent workload from a deleted one.

```sh
curl -i -X DELETE http://localhost:3000/api/v1/workloads/20000000-0000-4000-a000-000000000001
```

Success: `204`; access errors `401`/`403`; database error `500`.

### `GET /api/v1/workloads/{id}/attribution-rules`

Lists rules for an existing workload. No query parameters or pagination.

```sh
curl http://localhost:3000/api/v1/workloads/20000000-0000-4000-a000-000000000001/attribution-rules
```

```json
{"data":[{"id":"40000000-0000-4000-a000-000000000001","organizationId":"8a775c7f-e31c-8f9b-9000-000000000001","workloadId":"20000000-0000-4000-a000-000000000001","provider":"openai","matchType":"api_key","matchValue":"support-key","createdAt":"2026-11-01T10:00:00.000Z"}]}
```

Errors: `401`/`403`, `404` workload not found, `500` database/server error.

### `POST /api/v1/workloads/{id}/attribution-rules`

Creates a rule with required non-empty string fields `provider`, `matchType`, `matchValue`; unknown fields are rejected. Current matching implementation uses `matchType: "api_key"` to match usage `api_key_id` plus provider. The API does not enforce an enum for provider/matchType. A database uniqueness rule prevents the same `(organization, provider, match type, match value)` being assigned twice.

```sh
curl -X POST http://localhost:3000/api/v1/workloads/20000000-0000-4000-a000-000000000001/attribution-rules -H 'Content-Type: application/json' -d '{"provider":"openai","matchType":"api_key","matchValue":"support-key"}'
```

```json
{"data":{"id":"40000000-0000-4000-a000-000000000001","organizationId":"8a775c7f-e31c-8f9b-9000-000000000001","workloadId":"20000000-0000-4000-a000-000000000001","provider":"openai","matchType":"api_key","matchValue":"support-key","createdAt":"2026-11-01T10:00:00.000Z"}}
```

Returns `201`; `400` missing field, duplicate rule, or unknown field; `401`/`403`; `404` workload not found; `500` database/server error.

### `DELETE /api/v1/workloads/{id}/attribution-rules/{ruleId}`

Deletes a rule scoped to the active workspace and workload. No body; success is `204` empty. Missing workload returns `404`; a missing rule under an existing workload is not distinguished and returns `204`. Access errors `401`/`403`; database error `500`.

```sh
curl -i -X DELETE http://localhost:3000/api/v1/workloads/20000000-0000-4000-a000-000000000001/attribution-rules/40000000-0000-4000-a000-000000000001
```

## Dashboard, audit, monitoring, and alerts

### `GET /api/v1/dashboard/summary`

Requires `start`, `end`; parseable, ordered, max 366 days. Returns range totals, per-workload summaries, up to three newest open alerts, up to three newest open audit findings as `costChangeEvidence`, and the requested `timeWindow`. No pagination. Org-wide CPO is deliberately unavailable because cost cannot be assigned to one workload/outcome type. `workloadSummaries[].costPerOutcome` is populated only when pricing is complete and exactly one outcome type exists for that workload/window; the reason is in `costPerOutcomeAvailabilityReason`.

```sh
curl 'http://localhost:3000/api/v1/dashboard/summary?start=2026-11-01T00%3A00%3A00Z&end=2026-11-08T00%3A00%3A00Z'
```

```json
{"totalCost":"0.42","knownCost":"0.42","isCostComplete":true,"pricedEventCount":12,"unpricedEventCount":0,"totalTokens":20000,"totalRequests":90,"totalOutcomes":7,"attributedCost":"0.42","attributedKnownCost":"0.42","unattributedCost":"0","unattributedKnownCost":"0","unattributedIsCostComplete":true,"unattributedEventCount":0,"activeAlerts":0,"outcomes":{"totalCount":7,"primaryCpo":{"costPerOutcome":null,"availabilityReason":"Organization-wide cost per outcome is unavailable because organization cost cannot be matched to a single workload and outcome type."}},"workloadSummaries":[{"id":"20000000-0000-4000-a000-000000000001","name":"Support triage","cost":"0.42","knownCost":"0.42","isCostComplete":true,"unpricedEventCount":0,"usage":20000,"outcomes":7,"costPerOutcome":"0.06","costPerOutcomeAvailabilityReason":null,"changePct":null}],"recentAlerts":[],"costChangeEvidence":[],"timeWindow":{"start":"2026-11-01T00:00:00.000Z","end":"2026-11-08T00:00:00.000Z"}}
```

Errors: `400` missing/invalid range; `401`/`403`; `500` database/server error.

### `GET /api/v1/dashboard/trends`

Requires `start`, `end`, same range rules. Returns one UTC-day array item per day covered, including days with no usage or outcomes; values are scoped to `[start,end)` even for partial first/last days. No pagination.

```sh
curl 'http://localhost:3000/api/v1/dashboard/trends?start=2026-11-01T00%3A00%3A00Z&end=2026-11-03T00%3A00%3A00Z'
```

```json
[{"date":"2026-11-01","cost":"0.12","knownCost":"0.12","isCostComplete":true,"pricedEventCount":4,"unpricedEventCount":0,"tokens":5000,"requests":20,"outcomes":2},{"date":"2026-11-02","cost":"0","knownCost":"0","isCostComplete":true,"pricedEventCount":0,"unpricedEventCount":0,"tokens":0,"requests":0,"outcomes":0}]
```

Errors: `400` missing/invalid range; `401`/`403`; `500` RPC/server error.

### `POST /api/v1/audits`

Body requires `workloadId` UUID, `start`, `end` parseable dates. The service caps requested span at 366 days, snaps both ends to UTC midnight, and clamps the effective end to today UTC and (if present) the earliest provider sync watermark. The effective window must remain positive; baseline is the immediately preceding window of equal duration. Findings persist idempotently by organization/workload/category/effective window; repeated audits update the matching finding rather than create another. No pagination.

```sh
curl -X POST http://localhost:3000/api/v1/audits -H 'Content-Type: application/json' -d '{"workloadId":"20000000-0000-4000-a000-000000000001","start":"2026-11-01T00:00:00Z","end":"2026-11-04T00:00:00Z"}'
```

```json
{"window":{"start":"2026-11-01T00:00:00.000Z","end":"2026-11-04T00:00:00.000Z"},"findings":[{"id":"50000000-0000-4000-a000-000000000001","organizationId":"8a775c7f-e31c-8f9b-9000-000000000001","workloadId":"20000000-0000-4000-a000-000000000001","category":"COST_DRIFT","severity":"MEDIUM","title":"Cost drift detected","description":"...","confidence":"HIGH","evidence":{"metric":"cost_drift","windowStart":"2026-11-01T00:00:00.000Z","windowEnd":"2026-11-04T00:00:00.000Z"},"timeWindowStart":"2026-11-01T00:00:00.000Z","timeWindowEnd":"2026-11-04T00:00:00.000Z","detectedAt":"2026-11-04T00:00:00.000Z","status":"OPEN"}],"metadata":{"rulesEvaluated":["COST_DRIFT"],"rulesSkipped":[]}}
```

Returns `400` for missing/invalid fields, effective empty range, or too-long range; `401`/`403`; `404` workload not found; `500` database/server error.

### `GET /api/v1/audits`

Returns up to 50 newest audit finding database rows for the workspace. There is no filter or pagination parameter.

```sh
curl http://localhost:3000/api/v1/audits
```

```json
{"findings":[{"id":"50000000-0000-4000-a000-000000000001","organization_id":"8a775c7f-e31c-8f9b-9000-000000000001","workload_id":"20000000-0000-4000-a000-000000000001","category":"COST_DRIFT","severity":"MEDIUM","title":"Cost drift detected","description":"...","confidence":"HIGH","evidence":{},"time_window_start":"2026-11-01T00:00:00+00:00","time_window_end":"2026-11-04T00:00:00+00:00","detected_at":"2026-11-04T00:00:00+00:00","created_at":"2026-11-04T00:00:00+00:00","status":"OPEN"}]}
```

Errors: `401`/`403` access; `500` database/server error.

### `POST /api/v1/monitoring/run`

Runs monitoring for enabled configurations in the active workspace. No request body, query, or idempotency key. The in-process token bucket allows a burst of five calls and refills five per minute; the limit is per process and is not shared across instances. Returns the stored `monitoring_runs` row in `snake_case`.

```sh
curl -X POST http://localhost:3000/api/v1/monitoring/run
```

```json
{"id":"60000000-0000-4000-a000-000000000001","organization_id":"8a775c7f-e31c-8f9b-9000-000000000001","started_at":"2026-11-04T10:00:00.000Z","completed_at":"2026-11-04T10:00:03.000Z","status":"COMPLETED","evaluated_workloads":1,"findings_count":0,"alerts_count":0,"error_info":null}
```

Errors: `429` rate limit; `401`/`403`; `500` run/database error. The handler currently ignores an error from its final run-row lookup and can return `200 null` in that rare case.

### `GET /api/v1/alerts`

Lists alert rows for the workspace newest-first. Optional exact filters: `workloadId`, `status` (`OPEN`, `ACKNOWLEDGED`, `RESOLVED`), and `severity` (`INFO`, `LOW`, `MEDIUM`, `HIGH`). No pagination or time range is implemented by the handler; the result may be limited by the PostgREST server's configured maximum row count. The handler does not validate filter values before sending them to PostgREST, so unsupported values can return `500`.

```sh
curl 'http://localhost:3000/api/v1/alerts?status=OPEN&severity=HIGH'
```

```json
{"alerts":[{"id":"70000000-0000-4000-a000-000000000001","organization_id":"8a775c7f-e31c-8f9b-9000-000000000001","workload_id":"20000000-0000-4000-a000-000000000001","finding_id":"50000000-0000-4000-a000-000000000001","category":"COST_DRIFT","severity":"HIGH","status":"OPEN","fingerprint":"8a775c7f-e31c-8f9b-9000-000000000001:20000000-0000-4000-a000-000000000001:COST_DRIFT","notified_at":null,"last_notified_severity":null,"created_at":"2026-11-04T10:00:00.000Z","updated_at":"2026-11-04T10:00:00.000Z"}]}
```

Errors: `401`/`403`; `500` database/server error.

### `POST /api/v1/alerts/{id}/acknowledge`

No body. Transitions an alert from `OPEN` to `ACKNOWLEDGED`; it cannot acknowledge an already acknowledged or resolved alert.

```sh
curl -X POST http://localhost:3000/api/v1/alerts/70000000-0000-4000-a000-000000000001/acknowledge
```

```json
{"alert":{"id":"70000000-0000-4000-a000-000000000001","organization_id":"8a775c7f-e31c-8f9b-9000-000000000001","workload_id":"20000000-0000-4000-a000-000000000001","finding_id":"50000000-0000-4000-a000-000000000001","category":"COST_DRIFT","severity":"HIGH","status":"ACKNOWLEDGED","fingerprint":"8a775c7f-e31c-8f9b-9000-000000000001:20000000-0000-4000-a000-000000000001:COST_DRIFT","notified_at":null,"created_at":"2026-11-04T10:00:00.000Z","updated_at":"2026-11-04T10:01:00.000Z","last_notified_severity":null}}
```

Errors: `404` unknown/out-of-workspace or invalid state; `401`/`403`; `500` database/server error.

### `POST /api/v1/alerts/{id}/resolve`

No body. Transitions an alert from `OPEN` or `ACKNOWLEDGED` to `RESOLVED`.

```sh
curl -X POST http://localhost:3000/api/v1/alerts/70000000-0000-4000-a000-000000000001/resolve
```

```json
{"alert":{"id":"70000000-0000-4000-a000-000000000001","organization_id":"8a775c7f-e31c-8f9b-9000-000000000001","workload_id":"20000000-0000-4000-a000-000000000001","finding_id":"50000000-0000-4000-a000-000000000001","category":"COST_DRIFT","severity":"HIGH","status":"RESOLVED","fingerprint":"8a775c7f-e31c-8f9b-9000-000000000001:20000000-0000-4000-a000-000000000001:COST_DRIFT","notified_at":null,"created_at":"2026-11-04T10:00:00.000Z","updated_at":"2026-11-04T10:02:00.000Z","last_notified_severity":null}}
```

Errors: `404` unknown/out-of-workspace or invalid state; `401`/`403`; `500` database/server error.

## Internal maintenance endpoints

These endpoints are documented for `Authorization: Bearer $CRON_SECRET`, not a Supabase user token. `CRON_SECRET` must be configured server-side. They operate only on the explicitly configured workspace. The implementation strips the exact `Bearer ` prefix if present and also accepts a raw header equal to the secret; callers should use the documented Bearer form. Do not expose them without a high-entropy secret and network controls.

### `POST /api/v1/internal/monitoring/run`

No body. Runs monitoring for the active workspace and returns `{ "runs": [<monitoring_runs row>], "count": 1 }`. It has no pagination or idempotency key.

```sh
curl -X POST http://localhost:3000/api/v1/internal/monitoring/run -H "Authorization: Bearer $CRON_SECRET"
```

```json
{"runs":[{"id":"60000000-0000-4000-a000-000000000001","organization_id":"8a775c7f-e31c-8f9b-9000-000000000001","status":"COMPLETED","evaluated_workloads":1,"findings_count":0,"alerts_count":0}],"count":1}
```

Errors: `503` secret absent or workspace config invalid; `401` wrong/missing secret; `500` run/server error.

### `POST /api/v1/internal/usage/reprice`

No body. Retries pricing of currently unpriced usage in the active workspace using the pricing catalog. It is not a provider sync endpoint. No pagination or idempotency key.

```sh
curl -X POST http://localhost:3000/api/v1/internal/usage/reprice -H "Authorization: Bearer $CRON_SECRET"
```

```json
{"processedOrgs":1,"totalAttempted":3,"totalSuccessful":2,"totalStillUnpriced":1}
```

`processedOrgs` is 0 or 1 because only the active workspace is examined. Errors: `503` secret absent or workspace config invalid; `401` wrong/missing secret; `500` database/server error.

## Not implemented

There is no API endpoint to connect OpenAI/Anthropic credentials, sync provider usage, configure workloads' monitoring settings, or configure webhook channels. OpenAI and Anthropic adapters are library primitives only. CSV upload and outcome submission are the implemented ingestion APIs. Do not treat example URLs in other subsystem notes as implemented routes unless listed above.

Known handler gap: malformed JSON can become `500` on handlers that do not catch parse errors. The Alerts page invokes the local operator endpoint `POST /api/v1/monitoring/run`; the separate internal cron endpoint remains protected by `CRON_SECRET` for trusted schedulers.
