import { describe, it, expect } from 'vitest';
import { calculateCost } from '../calculator';
import { InvalidUsageError, IncompletePricingError } from '../errors';
import { CanonicalUsageEvent, PricingRecord } from '../../types';

describe('Pricing Calculator', () => {
  const baseUsage: CanonicalUsageEvent = {
    id: 'u1',
    provider: 'openai',
    model: 'gpt-4',
    timestamp: new Date(),
    usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 },
    attribution: {},
    providerReference: 'ref-1',
    rawResponseHash: 'hash-1'
  };

  const basePricing: PricingRecord = {
    id: 'p1',
    provider: 'openai',
    model: 'gpt-4',
    inputPrice: '10', // $10 per 1M
    outputPrice: '30', // $30 per 1M
    effectiveFrom: new Date(),
    source: 'test'
  };

  it('calculates zero cost for zero tokens', () => {
    const result = calculateCost(baseUsage, basePricing);
    expect(result.totalCost).toBe('0');
    expect(result.inputCost).toBe('0');
    expect(result.outputCost).toBe('0');
  });

  it('calculates regular input and output cost', () => {
    const usage = { ...baseUsage, usage: { inputTokens: 500_000, outputTokens: 1_000_000 } };
    const result = calculateCost(usage, basePricing);
    
    // 0.5M * $10 = $5
    expect(result.inputCost).toBe('5');
    // 1M * $30 = $30
    expect(result.outputCost).toBe('30');
    expect(result.totalCost).toBe('35');
    expect(result.billableInputTokens).toBe(500_000);
  });

  it('properly subtracts cached tokens from input tokens', () => {
    const usage = { ...baseUsage, usage: { inputTokens: 100_000, cacheReadTokens: 30_000, cacheCreationTokens: 10_000, outputTokens: 0 } };
    const pricing = { ...basePricing, cacheReadPrice: '5', cacheCreationPrice: '15' };
    
    const result = calculateCost(usage, pricing);
    
    // Billable regular input = 60,000. 60k * $10 / 1M = $0.6
    expect(result.inputCost).toBe('0.6');
    // Read = 30k * $5 / 1M = $0.15
    expect(result.cacheReadCost).toBe('0.15');
    // Creation = 10k * $15 / 1M = $0.15
    expect(result.cacheCreationCost).toBe('0.15');
    
    expect(result.totalCost).toBe('0.9');
    expect(result.billableInputTokens).toBe(60_000);
    expect(result.billableCacheReadTokens).toBe(30_000);
    expect(result.billableCacheCreationTokens).toBe(10_000);
  });

  it('throws IncompletePricingError if usage has cache tokens but pricing lacks cache price', () => {
    const usage = { ...baseUsage, usage: { inputTokens: 100, cacheReadTokens: 50, outputTokens: 0 } };
    expect(() => calculateCost(usage, basePricing)).toThrow(IncompletePricingError);
  });

  it('throws InvalidUsageError if token counts are negative', () => {
    const usage = { ...baseUsage, usage: { inputTokens: -10, outputTokens: 0 } };
    expect(() => calculateCost(usage, basePricing)).toThrow(InvalidUsageError);
  });

  it('throws InvalidUsageError if combined cached tokens exceed total input tokens', () => {
    const usage = { ...baseUsage, usage: { inputTokens: 10, cacheReadTokens: 8, cacheCreationTokens: 5, outputTokens: 0 } };
    expect(() => calculateCost(usage, basePricing)).toThrow(InvalidUsageError);
  });
});
