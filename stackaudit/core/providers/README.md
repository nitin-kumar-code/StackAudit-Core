# Provider Adapters & Usage Ingestion

This module connects external AI providers (and CSV fallbacks) to the canonical Core usage model.

## Canonical Usage Normalization
All provider adapters implement `ProviderAdapter`. Their solitary job is:
`Provider API Data -> CanonicalUsageEvent`
They handle authentication, fetch limits, and pagination. They do **not** calculate costs or attribute to workloads.

## Actual Provider API Behavior & Limitations (V0)

### OpenAI
We use the Admin API `https://api.openai.com/v1/organization/usage/completions` which returns daily buckets of token usage per project/model.
**Limitation:** It provides time-bucketed aggregates (not per-request). We synthetically generate a deterministic `providerReference` using the bucket start time, model, and project ID to safely deduplicate ingestion runs in Supabase.

### Anthropic
Anthropic currently does not expose a standard public REST API for fetching organization usage (only via dashboard CSV exports).
**Limitation:** The `AnthropicAdapter` assumes an upcoming or undocumented console API structure (`/v1/organization/usage`). For strict V0 production usage, you should use the CSV ingestion fallback for Anthropic.

### Deduplication Strategy (Idempotency)
Ingestion is completely idempotent. We rely on PostgreSQL's `ON CONFLICT (organization_id, provider, provider_reference) DO NOTHING`. Overlapping time windows will seamlessly drop previously ingested buckets.

## Cost Integration
Once `CanonicalUsageEvent` records are generated, the ingestion orchestrator (`core/usage/ingestion.ts`) queries the `PricingCatalog` (Phase 3). If pricing is missing, it explicitly logs a pricing error and drops the event rather than guessing a $0 cost.

## Credentials Handling
**V0 Limitation:** Credentials (`apiKey`) are expected to be injected securely from the server-side environment. Never expose credentials to `NEXT_PUBLIC_*` or pass them via client-side components. The adapters operate purely statelessly based on injected `DecryptedCredentials`.
