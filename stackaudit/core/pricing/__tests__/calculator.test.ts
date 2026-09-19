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
    usage: { inputTokens: 0, outputTokens: 0 },
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

  it('calculates fractional token costs precisely', () => {
    const usage = { ...baseUsage, usage: { inputTokens: 1, outputTokens: 0 } };
    const result = calculateCost(usage, basePricing);
    
    // 1 token * $10 per 1M = $0.00001
    expect(result.totalCost).toBe('0.00001');
  });

  it('properly subtracts cached tokens from input tokens', () => {
    const usage = { ...baseUsage, usage: { inputTokens: 100_000, cachedInputTokens: 40_000, outputTokens: 0 } };
    const pricing = { ...basePricing, cachedInputPrice: '5' }; // $5 per 1M
    
    const result = calculateCost(usage, pricing);
    
    // Billable regular input = 60,000. 60k * $10 / 1M = $0.6
    expect(result.inputCost).toBe('0.6');
    // Cached input = 40,000. 40k * $5 / 1M = $0.2
    expect(result.cachedInputCost).toBe('0.2');
    expect(result.totalCost).toBe('0.8');
    expect(result.billableInputTokens).toBe(60_000);
    expect(result.billableCachedTokens).toBe(40_000);
  });

  it('throws IncompletePricingError if usage has cached tokens but pricing lacks cached price', () => {
    const usage = { ...baseUsage, usage: { inputTokens: 100, cachedInputTokens: 50, outputTokens: 0 } };
    expect(() => calculateCost(usage, basePricing)).toThrow(IncompletePricingError);
  });

  it('throws InvalidUsageError if token counts are negative', () => {
    const usage = { ...baseUsage, usage: { inputTokens: -10, outputTokens: 0 } };
    expect(() => calculateCost(usage, basePricing)).toThrow(InvalidUsageError);
  });

  it('throws InvalidUsageError if cached tokens exceed total input tokens', () => {
    const usage = { ...baseUsage, usage: { inputTokens: 10, cachedInputTokens: 20, outputTokens: 0 } };
    expect(() => calculateCost(usage, basePricing)).toThrow(InvalidUsageError);
  });
  
  it('throws InvalidUsageError if pricing is negative', () => {
    const usage = { ...baseUsage, usage: { inputTokens: 10, outputTokens: 0 } };
    const pricing = { ...basePricing, inputPrice: '-5' };
    expect(() => calculateCost(usage, pricing)).toThrow(InvalidUsageError);
  });
});
