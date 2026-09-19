# Pricing Engine

The Pricing Engine is responsible for translating raw token counts into deterministic, historically accurate financial costs.

## 1. Pricing Record Versioning & Effective Dates
Prices in AI models change frequently. To ensure historical calculations (and billing audits) remain accurate indefinitely, we use **time-travel versioning**. 
Each `PricingRecord` has an `effectiveFrom` timestamp and an optional `effectiveUntil` timestamp. 
We use half-open intervals `[effectiveFrom, effectiveUntil)`. 
- A price becomes active exactly at `effectiveFrom`.
- A price remains active up to, but NOT including, `effectiveUntil`.
- If `effectiveUntil` is undefined, the price is the currently active price.

## 2. Token Accounting
The canonical contract establishes that **`cachedInputTokens` is a subset of `inputTokens`**, because provider APIs typically report the total input tokens and the portion that was cached. 
Therefore:
`billableRegularInputTokens = inputTokens - cachedInputTokens`

## 3. Decimal/Financial Precision
AI token prices are frequently fractional cents (e.g., $0.15 per 1M tokens means $0.00000015 per token).
We **strictly avoid JavaScript floating-point arithmetic** (`0.00000015 * tokens`).
Instead, we use `big.js` to ensure decimal-safe, arbitrary-precision arithmetic. Costs and prices are stored and returned as strings (e.g., `"0.005"`) or PostgreSQL `NUMERIC` types, never as JS `number`.

## 4. Pricing Lookup Behavior
The `InMemoryPricingCatalog` (and future DB repository) strictly requires exactly **one** active pricing record for a given `(provider, model, timestamp)` tuple.
- If no record is found, it throws `PricingNotFoundError`.
- If overlapping intervals are found, it throws `AmbiguousPricingError`.
It will never silently guess or fallback to an inaccurate price.

## 5. Cost Calculation Formula
Costs are priced per 1,000,000 tokens (1M).
`inputCost = (inputTokens - cachedInputTokens) / 1,000,000 * inputPrice`
`cachedCost = cachedInputTokens / 1,000,000 * cachedInputPrice`
`outputCost = outputTokens / 1,000,000 * outputPrice`
`totalCost = inputCost + cachedCost + outputCost`

## 6. Known Limitations / Not Yet Supported
- **Custom / Negotiated Pricing**: `findEffectivePrice` does not take a tenant or organization scope. All pricing is assumed to be the global public list price. Custom enterprise discounts will require adding an organization-level override layer in a future phase.
- **Output Token Bounds Validation**: The `calculateCost` function accepts any non-negative number for output tokens without setting a strict sanity bound (e.g., checking against model max context length). The ingestion layer must independently guard against obviously-corrupt provider data before it reaches the pricing engine.
