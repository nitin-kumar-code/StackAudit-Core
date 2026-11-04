# Provider adapters and V0 ingestion

These adapters are library primitives. StackAudit V0 does not expose provider connection UI or store provider credentials. The supported user-facing workflow is canonical CSV import from the Usage page.

## Provider status

### OpenAI — LIBRARY PRIMITIVE ONLY

The adapter has request and pagination code, but its normalization expects token fields that do not match the current official Completions Usage result schema. It is not wired to an application route, credential configuration, persistence, pricing, or attribution. Do not use it as a supported connection until updated against the current schema and tested with official-shape fixtures.

### Anthropic — LIBRARY PRIMITIVE ONLY

Anthropic documents a legacy Admin Usage and Cost API and recommends a newer Analytics API for new integrations. The adapter targets the legacy usage endpoint, but it is not wired to the app, and its response and pagination assumptions have not been verified against the current reference. For V0, export usage from Anthropic Console and map it to the canonical CSV schema.

## CSV schema

Required headers: `provider,model,timestamp,input_tokens,output_tokens,provider_reference`.

Optional headers: `cache_read_tokens,cache_creation_tokens,request_count,api_key_id`.

Timestamps must be parseable ISO date/time values. Token and request counts must be non-negative whole numbers. `provider_reference` must be stable and unique for a provider record; repeat imports with the same provider and reference are skipped. Include `api_key_id` to match existing provider/API-key workload attribution rules. Imports run within the explicitly configured workspace, use the shared pricing catalog, and retain unknown-price records as unpriced.

The UI provides a sample file at `/samples/stackaudit-usage.csv`, shows row-level validation errors and duplicate rows, and summarizes accepted, rejected, imported, and unpriced counts. Uploads are limited to 5 MB and 10,000 rows.

## Credentials

The CSV workflow requires no provider credentials. Adapters take credentials as server-side method arguments only; there is no connected provider credential lifecycle. Never pass provider keys to browser code or return them from an API.
