import Big from 'big.js';
import { PricingRecord, CanonicalUsageEvent } from '../types';
import { InvalidUsageError, IncompletePricingError } from './errors';
import { CostCalculationResult } from './types';

const MILLION = new Big(1_000_000);

export function calculateCost(
  usage: CanonicalUsageEvent,
  pricing: PricingRecord
): CostCalculationResult {
  const { inputTokens, outputTokens, cacheReadTokens = 0, cacheCreationTokens = 0 } = usage.usage;

  if (inputTokens < 0 || outputTokens < 0 || cacheReadTokens < 0 || cacheCreationTokens < 0) {
    throw new InvalidUsageError('Token counts cannot be negative.');
  }

  // Canonical contract: cached tokens (read + creation) are subsets of total inputTokens.
  if (cacheReadTokens + cacheCreationTokens > inputTokens) {
    throw new InvalidUsageError('Combined cached tokens cannot exceed total inputTokens.');
  }

  const billableRegularInputTokens = inputTokens - cacheReadTokens - cacheCreationTokens;

  // Protect against silent 0-cost mis-pricing for cached tokens
  if (cacheReadTokens > 0) {
    if (pricing.cacheReadPrice === undefined || pricing.cacheReadPrice === null || pricing.cacheReadPrice === '') {
      throw new IncompletePricingError(`Pricing record '${pricing.id}' lacks a cacheReadPrice, but usage contains cacheReadTokens.`);
    }
  }
  if (cacheCreationTokens > 0) {
    if (pricing.cacheCreationPrice === undefined || pricing.cacheCreationPrice === null || pricing.cacheCreationPrice === '') {
      throw new IncompletePricingError(`Pricing record '${pricing.id}' lacks a cacheCreationPrice, but usage contains cacheCreationTokens.`);
    }
  }

  const inputPrice = new Big(pricing.inputPrice);
  const outputPrice = new Big(pricing.outputPrice);
  const cacheReadPrice = cacheReadTokens > 0 ? new Big(pricing.cacheReadPrice!) : new Big(0);
  const cacheCreationPrice = cacheCreationTokens > 0 ? new Big(pricing.cacheCreationPrice!) : new Big(0);

  if (inputPrice.lt(0) || outputPrice.lt(0) || cacheReadPrice.lt(0) || cacheCreationPrice.lt(0)) {
    throw new InvalidUsageError('Pricing records cannot have negative prices.');
  }

  const inputCost = new Big(billableRegularInputTokens).div(MILLION).mul(inputPrice);
  const cacheReadCostObj = new Big(cacheReadTokens).div(MILLION).mul(cacheReadPrice);
  const cacheCreationCostObj = new Big(cacheCreationTokens).div(MILLION).mul(cacheCreationPrice);
  const outputCost = new Big(outputTokens).div(MILLION).mul(outputPrice);

  const totalCost = inputCost.plus(cacheReadCostObj).plus(cacheCreationCostObj).plus(outputCost);

  return {
    totalCost: totalCost.toFixed(),
    inputCost: inputCost.toFixed(),
    outputCost: outputCost.toFixed(),
    cacheReadCost: cacheReadCostObj.toFixed(),
    cacheCreationCost: cacheCreationCostObj.toFixed(),
    
    pricingRecordId: pricing.id,
    provider: pricing.provider,
    model: pricing.model,
    calculatedAt: new Date(),

    billableInputTokens: billableRegularInputTokens,
    billableCacheReadTokens: cacheReadTokens,
    billableCacheCreationTokens: cacheCreationTokens,
    billableOutputTokens: outputTokens,
  };
}
