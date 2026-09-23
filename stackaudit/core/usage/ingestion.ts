import { SupabaseClient } from '@supabase/supabase-js';
import { CanonicalUsageEvent } from '../types';
import { IPricingCatalog, calculateCost, PricingNotFoundError, IncompletePricingError } from '../pricing';

export interface IngestionResult {
  totalProcessed: number;
  successful: number;
  pricingFailed: number;
  pricingFailedEvents: Array<{ provider: string; model: string; timestamp: Date; error: string }>;
  errors: Error[];
}

export async function ingestUsageEvents(
  events: CanonicalUsageEvent[],
  organizationId: string,
  pricingCatalog: IPricingCatalog,
  supabase: SupabaseClient
): Promise<IngestionResult> {
  const result: IngestionResult = {
    totalProcessed: events.length,
    successful: 0,
    pricingFailed: 0,
    pricingFailedEvents: [],
    errors: []
  };

  if (events.length === 0) return result;

  const recordsToInsert = [];

  for (const event of events) {
    let cost = '0';
    let isUnpriced = false;

    try {
      const pricingRecord = await pricingCatalog.findEffectivePrice(
        event.provider,
        event.model,
        event.timestamp
      );
      const costResult = calculateCost(event, pricingRecord);
      cost = costResult.totalCost;
    } catch (error) {
      if (error instanceof PricingNotFoundError || error instanceof IncompletePricingError) {
        result.pricingFailed++;
        isUnpriced = true;
        result.pricingFailedEvents.push({
          provider: event.provider,
          model: event.model,
          timestamp: event.timestamp,
          error: (error as Error).message
        });
      } else {
        result.errors.push(error as Error);
        continue;
      }
    }

    recordsToInsert.push({
      id: event.id,
      organization_id: organizationId,
      provider: event.provider,
      model: event.model,
      timestamp: event.timestamp.toISOString(),
      input_tokens: event.usage.inputTokens,
      output_tokens: event.usage.outputTokens,
      cache_read_tokens: event.usage.cacheReadTokens || 0,
      cache_creation_tokens: event.usage.cacheCreationTokens || 0,
      provider_reference: event.providerReference,
      api_key_id: event.attribution.apiKeyId || null,
      calculated_cost: cost,
      is_unpriced: isUnpriced,
      request_count: event.usage.requestCount || 1,
      raw_response_hash: event.rawResponseHash,
      captured_at: event.capturedAt?.toISOString() || new Date().toISOString()
    });
  }

  if (recordsToInsert.length > 0) {
    // True upsert overwrites aggregated values safely
    const { error } = await supabase
      .from('usage_events')
      .upsert(recordsToInsert, { 
        onConflict: 'organization_id,provider,provider_reference'
      });

    if (error) {
      result.errors.push(new Error(`Database insert failed: ${error.message}`));
    } else {
      result.successful = recordsToInsert.length;
    }
  }

  return result;
}
