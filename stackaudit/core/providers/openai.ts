import crypto from 'crypto';
import { ProviderAdapter, DecryptedCredentials, ProviderAuthenticationError, ProviderApiError, ProviderRateLimitError } from './types';
import { CanonicalUsageEvent } from '../types';

export class OpenAIAdapter implements ProviderAdapter {
  providerName = 'openai';

  async validateCredentials(credentials: DecryptedCredentials): Promise<boolean> {
    const res = await fetch('https://api.openai.com/v1/models', {
      headers: {
        'Authorization': `Bearer ${credentials.apiKey}`,
        ...(credentials.organizationId && { 'OpenAI-Organization': credentials.organizationId })
      }
    });
    
    if (res.status === 401 || res.status === 403) return false;
    if (!res.ok) throw new ProviderApiError(this.providerName, `Failed to validate: ${res.statusText}`);
    return true;
  }

  async fetchUsage(credentials: DecryptedCredentials, startTime: Date, endTime: Date): Promise<CanonicalUsageEvent[]> {
    const url = new URL('https://api.openai.com/v1/organization/usage/completions');
    url.searchParams.append('start_time', Math.floor(startTime.getTime() / 1000).toString());
    url.searchParams.append('end_time', Math.floor(endTime.getTime() / 1000).toString());
    url.searchParams.append('bucket_width', '1d');
    
    // Group by to prevent collisions in deduplication
    url.searchParams.append('group_by[]', 'model');
    url.searchParams.append('group_by[]', 'project_id');
    url.searchParams.append('group_by[]', 'api_key_id');
    
    const events: CanonicalUsageEvent[] = [];
    let hasMore = true;
    let after: string | undefined = undefined;

    while (hasMore) {
      if (after) url.searchParams.set('after', after);
      
      const res = await fetch(url.toString(), {
        headers: {
          'Authorization': `Bearer ${credentials.apiKey}`,
          ...(credentials.organizationId && { 'OpenAI-Organization': credentials.organizationId })
        }
      });

      if (res.status === 401 || res.status === 403) {
        throw new ProviderAuthenticationError(this.providerName, 'Invalid API key or insufficient permissions.');
      }
      if (res.status === 429) {
        throw new ProviderRateLimitError(this.providerName, 'Rate limit exceeded on Admin API. Consider retrying with exponential backoff.');
      }
      if (!res.ok) {
        throw new ProviderApiError(this.providerName, `HTTP ${res.status} ${res.statusText}`);
      }

      const body = await res.json();
      
      for (const record of body.data || []) {
        const timestamp = new Date((record.aggregation_timestamp || 0) * 1000);
        
        const inputTokens = record.n_context_tokens_total || 0;
        const outputTokens = record.n_generated_tokens_total || 0;
        // OpenAI maps cached tokens strictly to read-side cache savings
        const cacheReadTokens = record.n_context_tokens_in_cache_total || 0;
        const cacheCreationTokens = 0; // OpenAI does not currently charge explicitly for cache creation
        
        const rawPayloadStr = JSON.stringify(record);
        const rawResponseHash = crypto.createHash('sha256').update(rawPayloadStr).digest('hex');
        
        const projectId = record.project_id || 'default';
        const apiKeyId = record.api_key_id || 'default';
        
        // Granular synthetic key
        const providerReference = crypto
          .createHash('sha256')
          .update(`openai_1d_${record.aggregation_timestamp}_${record.model}_${projectId}_${apiKeyId}`)
          .digest('hex');

        events.push({
          id: crypto.randomUUID(),
          provider: this.providerName,
          model: record.model,
          timestamp,
          usage: {
            inputTokens,
            outputTokens,
            cacheReadTokens,
            cacheCreationTokens
          },
          attribution: {
            apiKeyId,
            tags: { project_id: projectId }
          },
          providerReference,
          rawResponseHash,
          capturedAt: new Date()
        });
      }

      hasMore = body.has_more === true;
      if (hasMore && body.last_id) {
        after = body.last_id;
      } else {
        hasMore = false;
      }
    }

    return events;
  }
}
