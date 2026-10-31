# Reviewed Pricing Fixtures

This directory contains versioned reference pricing fixtures for StackAudit.

## Purpose

StackAudit uses an effective-dated `pricing_catalog` table to calculate cost from raw token usage. When a developer starts with an empty local database, migrations create the table schema but contain no rows. These fixtures provide a deterministic, reviewed set of reference prices so the application, ingestion pipelines, and demo seeders can operate without requiring manual database editing or live provider API access.

## Provenance & Attribution

The pricing figures in `reference-pricing-v1.json` are based on officially published API pricing from provider documentation:

| Provider | Model | Input ($/1M) | Output ($/1M) | Cache Read ($/1M) | Cache Write ($/1M) | Effective Window | Provenance Source |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **OpenAI** | `gpt-4o-mini` | $0.15 | $0.60 | $0.075 | $0.00 | 2024-07-18 → present | [OpenAI Pricing / Announcement](https://openai.com/index/gpt-4o-mini-advancing-cost-efficient-intelligence/) |
| **OpenAI** | `gpt-4o` (launch) | $5.00 | $15.00 | $2.50 | $0.00 | 2024-05-13 → 2024-08-06 | OpenAI Spring Update 2024 |
| **OpenAI** | `gpt-4o` (revised) | $2.50 | $10.00 | $1.25 | $0.00 | 2024-08-06 → present | [OpenAI API Pricing](https://openai.com/api/pricing/) |
| **Anthropic** | `claude-3-haiku-20240307` | $0.25 | $1.25 | $0.025 | $0.30 | 2024-03-07 → present | [Anthropic Pricing](https://docs.anthropic.com/en/docs/about-claude/models) |
| **Anthropic** | `claude-3-sonnet-20240229` | $3.00 | $15.00 | $0.30 | $3.75 | 2024-02-29 → present | [Anthropic Pricing](https://docs.anthropic.com/en/docs/about-claude/models) |
| **Anthropic** | `claude-3-5-sonnet-20240620` | $3.00 | $15.00 | $0.30 | $3.75 | 2024-06-20 → present | [Anthropic Pricing](https://docs.anthropic.com/en/docs/about-claude/models) |
| **Anthropic** | `claude-3-opus-20240229` | $15.00 | $75.00 | $1.50 | $18.75 | 2024-02-29 → present | [Anthropic Pricing](https://docs.anthropic.com/en/docs/about-claude/models) |

> [!NOTE]
> These fixtures represent **public reference list pricing** at the stated effective dates. They are explicitly marked with `source: sample-reference:...` to distinguish them from negotiated enterprise rates or manually maintained production catalog entries.

## Safe Loading & Idempotency Rules

When loading fixtures via `npm run pricing:load` or the first-run setup flow:
1. **Idempotent**: Fixture records have deterministic IDs. Re-running the loader produces the exact same state without errors or duplicates.
2. **Safe Preservation**: If a row exists with matching `(provider, model, effective_from)` whose `source` does **not** begin with `sample-reference:` or `fixture:`, the loader preserves that row intact and logs a skip notice.
3. **Updatable**: If a fixture record in the catalog has an existing `sample-reference:` source, running an updated fixture version updates the rates and metadata safely.
