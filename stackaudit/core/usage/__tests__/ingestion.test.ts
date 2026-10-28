import { describe, it, expect, vi } from 'vitest';
import { ingestUsageEvents } from '../ingestion';
import { CanonicalUsageEvent } from '../../types';
import { InMemoryPricingCatalog } from '../../pricing';
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
      attribution: { apiKeyId: 'key_abc' },
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
          api_key_id: 'key_abc',
          calculated_cost: '0.016',
          is_unpriced: false
        })
      ]),
      { onConflict: 'organization_id,provider,provider_reference' }
    );
  });

  it('increments pricingFailed, logs details, and inserts unpriced event', async () => {
    mockUpsert.mockResolvedValueOnce({ error: null });
    const emptyCatalog = new InMemoryPricingCatalog([]);
    const result = await ingestUsageEvents(events, 'org_1', emptyCatalog, mockSupabase);

    expect(result.successful).toBe(1); // Row was inserted successfully
    expect(result.pricingFailed).toBe(1);
    expect(result.pricingFailedEvents.length).toBe(1);
    expect(result.pricingFailedEvents[0].provider).toBe('openai');
    
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          is_unpriced: true,
          calculated_cost: '0'
        })
      ]),
      { onConflict: 'organization_id,provider,provider_reference' }
    );
  });
});
