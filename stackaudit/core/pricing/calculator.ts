import Big from 'big.js';
import { PricingRecord, CanonicalUsageEvent } from '../types';
import { InvalidUsageError, IncompletePricingError } from './errors';
import { CostCalculationResult } from './types';

// Pricing is per 1 million tokens
const MILLION = new Big(1_000_000);

export function calculateCost(
  usage: CanonicalUsageEvent,
  pricing: PricingRecord
): CostCalculationResult {
  const { inputTokens, outputTokens, cachedInputTokens = 0 } = usage.usage;

  if (inputTokens < 0 || outputTokens < 0 || cachedInputTokens < 0) {
    throw new InvalidUsageError('Token counts cannot be negative.');
  }

  // Canonical contract: cachedInputTokens is a subset of total inputTokens.
  if (cachedInputTokens > inputTokens) {
    throw new InvalidUsageError('cachedInputTokens cannot exceed total inputTokens.');
  }

  const billableRegularInputTokens = inputTokens - cachedInputTokens;

  // Protect against silent 0-cost mis-pricing for cached tokens
  if (cachedInputTokens > 0) {
    if (pricing.cachedInputPrice === undefined || pricing.cachedInputPrice === null || pricing.cachedInputPrice === '') {
      throw new IncompletePricingError(
        `Pricing record '${pricing.id}' lacks a cachedInputPrice, but usage contains cached tokens.`
      );
    }
  }

  // Prices must be valid numbers. Big.js will throw if invalid.
  const inputPrice = new Big(pricing.inputPrice);
  const outputPrice = new Big(pricing.outputPrice);
  const cachedInputPrice = cachedInputTokens > 0 ? new Big(pricing.cachedInputPrice!) : new Big(0);

  if (inputPrice.lt(0) || outputPrice.lt(0) || cachedInputPrice.lt(0)) {
    throw new InvalidUsageError('Pricing records cannot have negative prices.');
  }

  // Cost calculation
  const inputCost = new Big(billableRegularInputTokens).div(MILLION).mul(inputPrice);
  const cachedCost = new Big(cachedInputTokens).div(MILLION).mul(cachedInputPrice);
  const outputCost = new Big(outputTokens).div(MILLION).mul(outputPrice);

  const totalCost = inputCost.plus(cachedCost).plus(outputCost);

  return {
    totalCost: totalCost.toFixed(),
    inputCost: inputCost.toFixed(),
    outputCost: outputCost.toFixed(),
    cachedInputCost: cachedCost.toFixed(),
    
    pricingRecordId: pricing.id,
    provider: pricing.provider,
    model: pricing.model,
    calculatedAt: new Date(),

    billableInputTokens: billableRegularInputTokens,
    billableCachedTokens: cachedInputTokens,
    billableOutputTokens: outputTokens,
  };
}
