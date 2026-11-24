import { SupabaseClient } from '@supabase/supabase-js';
import { CanonicalUsageEvent } from '../types';
import { IPricingCatalog, calculateCost, PricingNotFoundError, IncompletePricingError } from '../pricing';

export interface IngestionResult {
  totalProcessed: number;
  successful: number;
  insertedEventIds: string[];
  conflictEventIds: string[];
  pricingFailed: number;
  pricingFailedEventIds: string[];
  pricingFailedEvents: Array<{ provider: string; model: string; timestamp: Date; error: string }>;
  errors: Error[];
}

export interface IngestionOptions {
  /** Ignore unique-key conflicts and report only rows inserted by this call. */
  conflictHandling?: 'upsert' | 'ignore';
}

export async function ingestUsageEvents(
  events: CanonicalUsageEvent[],
  organizationId: string,
  pricingCatalog: IPricingCatalog,
  supabase: SupabaseClient,
  options: IngestionOptions = {}
): Promise<IngestionResult> {
  const result: IngestionResult = {
    totalProcessed: events.length,
    successful: 0,
    insertedEventIds: [],
    conflictEventIds: [],
    pricingFailed: 0,
    pricingFailedEventIds: [],
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
        result.pricingFailedEventIds.push(event.id);
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
    const ignoreConflicts = options.conflictHandling === 'ignore';
    const write = supabase
      .from('usage_events')
      .upsert(recordsToInsert, {
        onConflict: 'organization_id,provider,provider_reference',
        ...(ignoreConflicts ? { ignoreDuplicates: true } : {})
      });

    if (ignoreConflicts) {
      const { data, error } = await write.select('id');
      if (error) {
        result.errors.push(new Error(`Database insert failed: ${error.message}`));
      } else {
        result.insertedEventIds = (data || []).map(row => row.id);
        result.successful = result.insertedEventIds.length;
        const insertedIds = new Set(result.insertedEventIds);
        result.conflictEventIds = recordsToInsert
          .map(record => record.id)
          .filter(id => !insertedIds.has(id));
      }
    } else {
      const { error } = await write;
      if (error) result.errors.push(new Error(`Database insert failed: ${error.message}`));
      else result.successful = recordsToInsert.length;
    }
  }

  return result;
}
