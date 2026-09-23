import { SupabaseClient } from '@supabase/supabase-js';
import { IPricingCatalog, calculateCost, PricingNotFoundError, IncompletePricingError } from '../pricing';
import { CanonicalUsageEvent } from '../types';

export async function repriceUnpricedEvents(
  organizationId: string,
  pricingCatalog: IPricingCatalog,
  supabase: SupabaseClient
) {
  let hasMore = true;
  let lastId: string | null = null;
  const BATCH_SIZE = 500;
  
  const result = {
    totalAttempted: 0,
    successful: 0,
    stillUnpriced: 0,
    errors: [] as Error[]
  };

  while (hasMore) {
    let query = supabase
      .from('usage_events')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('is_unpriced', true)
      .lt('reprice_attempts', 3) // B4: Cap retries
      .order('id', { ascending: true }) // Deterministic sorting
      .limit(BATCH_SIZE);
      
    if (lastId) {
      query = query.gt('id', lastId); // Keyset pagination for mutating datasets
    }

    const { data: rows, error: fetchError } = await query;

    if (fetchError) {
      result.errors.push(new Error(`Failed to fetch unpriced events: ${fetchError.message}`));
      break;
    }

    if (!rows || rows.length === 0) {
      hasMore = false;
      break;
    }
    
    result.totalAttempted += rows.length;
    const updates = [];

    for (const row of rows) {
      // Force a consistent shape for PostgREST batching
      // relies on reprice_attempts defaulting to 0 (NOT NULL schema guard)
      const updatePayload = {
        id: row.id,
        organization_id: organizationId,
        calculated_cost: row.calculated_cost,
        is_unpriced: row.is_unpriced,
        reprice_attempts: row.reprice_attempts || 0 
      };

      try {
        const canonical: CanonicalUsageEvent = {
          id: row.id,
          provider: row.provider,
          model: row.model,
          timestamp: new Date(row.timestamp),
          usage: {
            inputTokens: row.input_tokens,
            outputTokens: row.output_tokens,
            cacheReadTokens: row.cache_read_tokens,
            cacheCreationTokens: row.cache_creation_tokens
          },
          attribution: { apiKeyId: row.api_key_id || undefined },
          providerReference: row.provider_reference,
          rawResponseHash: row.raw_response_hash,
          capturedAt: new Date(row.captured_at)
        };

        const pricingRecord = await pricingCatalog.findEffectivePrice(
          canonical.provider,
          canonical.model,
          canonical.timestamp
        );
        
        const costResult = calculateCost(canonical, pricingRecord);
        
        // Success path mutation
        updatePayload.calculated_cost = costResult.totalCost;
        updatePayload.is_unpriced = false;
        
        result.successful++;
      } catch (error) {
        if (error instanceof PricingNotFoundError || error instanceof IncompletePricingError) {
          result.stillUnpriced++;
        } else {
          result.errors.push(error as Error);
        }
        // Failure path mutation
        updatePayload.reprice_attempts += 1;
      }
      
      updates.push(updatePayload);
    }

    if (updates.length > 0) {
      const { error: updateError } = await supabase
        .from('usage_events')
        .upsert(updates, { onConflict: 'id' }); // Use PK conflict to update

      if (updateError) {
        result.errors.push(new Error(`Failed to bulk update repriced events: ${updateError.message}`));
      }
    }

    if (rows.length < BATCH_SIZE) {
      hasMore = false;
    } else {
      lastId = rows[rows.length - 1].id;
    }
  }

  return result;
}
