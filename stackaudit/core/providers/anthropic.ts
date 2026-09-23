import crypto from 'crypto';
import { ProviderAdapter, DecryptedCredentials, ProviderAuthenticationError, ProviderApiError, ProviderRateLimitError } from './types';
import { CanonicalUsageEvent } from '../types';

export class AnthropicAdapter implements ProviderAdapter {
  providerName = 'anthropic';

  async validateCredentials(credentials: DecryptedCredentials): Promise<boolean> {
    // Requires Admin API Key (sk-ant-admin-...)
    const res = await fetch('https://api.anthropic.com/v1/organizations/usage_report/messages?bucket_width=1d', {
      headers: {
        'x-api-key': credentials.apiKey,
        'anthropic-version': '2023-06-01'
      }
    });
    
    if (res.status === 401 || res.status === 403) return false;
    return true;
  }

  async fetchUsage(credentials: DecryptedCredentials, startTime: Date, endTime: Date): Promise<CanonicalUsageEvent[]> {
    const url = new URL('https://api.anthropic.com/v1/organizations/usage_report/messages');
    url.searchParams.append('starting_at', startTime.toISOString());
    url.searchParams.append('ending_at', endTime.toISOString());
    url.searchParams.append('bucket_width', '1d');
    url.searchParams.append('group_by[]', 'model');
    url.searchParams.append('group_by[]', 'api_key');
    url.searchParams.append('group_by[]', 'workspace');
    
    const events: CanonicalUsageEvent[] = [];
    let hasMore = true;
    let pageToken: string | undefined = undefined;

    while (hasMore) {
      if (pageToken) url.searchParams.set('page_token', pageToken);
      
      const res = await fetch(url.toString(), {
        headers: {
          'x-api-key': credentials.apiKey,
          'anthropic-version': '2023-06-01'
        }
      });

      if (res.status === 401 || res.status === 403) {
        throw new ProviderAuthenticationError(this.providerName, 'Invalid Admin API key or insufficient permissions.');
      }
      if (res.status === 429) {
        throw new ProviderRateLimitError(this.providerName, 'Rate limit exceeded. Consider retrying with exponential backoff.');
      }
      if (!res.ok) {
        throw new ProviderApiError(this.providerName, `HTTP ${res.status} ${res.statusText}`);
      }

      const body = await res.json();
      
      for (const record of body.data || []) {
        // According to Anthropic usage report structure
        const timestamp = new Date(record.bucket_start || record.aggregation_timestamp);
        
        // Ensure tokens fall into the right buckets
        const inputTokens = record.input_tokens || 0;
        const outputTokens = record.output_tokens || 0;
        const cacheReadTokens = record.cache_read_input_tokens || 0; 
        const cacheCreationTokens = record.cache_creation_input_tokens || 0;
        
        const rawPayloadStr = JSON.stringify(record);
        const rawResponseHash = crypto.createHash('sha256').update(rawPayloadStr).digest('hex');
        
        // Granular Deduplication key includes bucket width and all group_by attributes
        const workspaceId = record.workspace_id || record.workspace || 'default';
        const apiKeyId = record.api_key_id || record.api_key || 'default';
        
        const providerReference = crypto
          .createHash('sha256')
          .update(`anthropic_1d_${timestamp.getTime()}_${record.model}_${workspaceId}_${apiKeyId}`)
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
            cacheCreationTokens,
            requestCount: 0 // B2: Anthropic API does not provide a request count
          },
          attribution: {
            apiKeyId,
            tags: { workspace_id: workspaceId }
          },
          providerReference,
          rawResponseHash,
          capturedAt: new Date()
        });
      }

      hasMore = body.has_more === true;
      if (hasMore && body.next_page_token) {
        pageToken = body.next_page_token;
      } else {
        hasMore = false;
      }
    }

    return events;
  }
}
