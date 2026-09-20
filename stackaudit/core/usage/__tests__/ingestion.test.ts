import { describe, it, expect, vi } from 'vitest';
import { ingestUsageEvents } from '../ingestion';
import { CanonicalUsageEvent } from '../../types';
import { InMemoryPricingCatalog, PricingNotFoundError } from '../../pricing';
import { SupabaseClient } from '@supabase/supabase-js';

const mockUpsert = vi.fn();
const mockSupabase = {
  from: () => ({
    upsert: mockUpsert
  })
} as unknown as SupabaseClient;

describe('Usage Ingestion Pipeline', () => {
  const timestamp = new Date('2026-01-01T12:00:00Z');
  
  const events: CanonicalUsageEvent[] = [
    {
      id: 'evt_1',
      provider: 'openai',
      model: 'gpt-4',
      timestamp,
      usage: { inputTokens: 1000, outputTokens: 200, cacheReadTokens: 0, cacheCreationTokens: 0 },
      attribution: {},
      providerReference: 'ref_1',
      rawResponseHash: 'hash_1',
      capturedAt: new Date()
    }
  ];

  const catalog = new InMemoryPricingCatalog([
    {
      id: 'p_1',
      provider: 'openai',
      model: 'gpt-4',
      inputPrice: '10',
      outputPrice: '30',
      effectiveFrom: new Date('2025-01-01'),
      source: 'test'
    }
  ]);

  it('successfully ingests valid events and calculates costs', async () => {
    mockUpsert.mockResolvedValueOnce({ error: null });

    const result = await ingestUsageEvents(events, 'org_1', catalog, mockSupabase);

    expect(result.successful).toBe(1);
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          organization_id: 'org_1',
          calculated_cost: '0.016'
        })
      ]),
      { onConflict: 'organization_id,provider,provider_reference' } // No ignoreDuplicates
    );
  });

  it('increments pricingFailed and logs details when pricing missing', async () => {
    const emptyCatalog = new InMemoryPricingCatalog([]);
    const result = await ingestUsageEvents(events, 'org_1', emptyCatalog, mockSupabase);

    expect(result.successful).toBe(0);
    expect(result.pricingFailed).toBe(1);
    expect(result.pricingFailedEvents.length).toBe(1);
    expect(result.pricingFailedEvents[0].provider).toBe('openai');
  });
});
