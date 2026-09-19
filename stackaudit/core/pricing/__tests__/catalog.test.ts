import { describe, it, expect } from 'vitest';
import { InMemoryPricingCatalog } from '../catalog';
import { PricingNotFoundError, AmbiguousPricingError } from '../errors';
import { PricingRecord } from '../../types';

describe('InMemoryPricingCatalog', () => {
  const jan1 = new Date('2026-01-01T00:00:00Z');
  const jun1 = new Date('2026-06-01T00:00:00Z');
  const dec1 = new Date('2026-12-01T00:00:00Z');

  const recordA: PricingRecord = {
    id: 'p1',
    provider: 'openai',
    model: 'gpt-4',
    inputPrice: '10',
    outputPrice: '30',
    effectiveFrom: jan1,
    effectiveUntil: jun1,
    source: 'test'
  };

  const recordB: PricingRecord = {
    id: 'p2',
    provider: 'openai',
    model: 'gpt-4',
    inputPrice: '5',
    outputPrice: '15',
    effectiveFrom: jun1,
    source: 'test'
  };

  const catalog = new InMemoryPricingCatalog([recordA, recordB]);

  it('resolves historical price for half-open interval', async () => {
    // May 31 uses Version A
    const may31 = new Date('2026-05-31T23:59:59Z');
    const result = await catalog.findEffectivePrice('openai', 'gpt-4', may31);
    expect(result.id).toBe('p1');
  });

  it('resolves new price exactly at effective boundary', async () => {
    // June 1 uses Version B
    const result = await catalog.findEffectivePrice('openai', 'gpt-4', jun1);
    expect(result.id).toBe('p2');
  });

  it('resolves current price when effectiveUntil is undefined', async () => {
    // Dec 1 uses Version B
    const result = await catalog.findEffectivePrice('openai', 'gpt-4', dec1);
    expect(result.id).toBe('p2');
  });

  it('throws PricingNotFoundError if no applicable record exists', async () => {
    const past = new Date('2025-01-01T00:00:00Z');
    await expect(catalog.findEffectivePrice('openai', 'gpt-4', past)).rejects.toThrow(PricingNotFoundError);
  });

  it('throws PricingNotFoundError for unknown provider/model', async () => {
    await expect(catalog.findEffectivePrice('anthropic', 'claude', jun1)).rejects.toThrow(PricingNotFoundError);
  });

  it('throws AmbiguousPricingError if intervals overlap', async () => {
    const overlapRecord: PricingRecord = {
      ...recordB,
      id: 'p3',
      effectiveFrom: new Date('2026-05-01T00:00:00Z')
    };
    const badCatalog = new InMemoryPricingCatalog([recordA, overlapRecord]);
    
    const may15 = new Date('2026-05-15T00:00:00Z');
    await expect(badCatalog.findEffectivePrice('openai', 'gpt-4', may15)).rejects.toThrow(AmbiguousPricingError);
  });
});
