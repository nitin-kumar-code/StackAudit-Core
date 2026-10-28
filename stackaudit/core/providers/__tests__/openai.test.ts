import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OpenAIAdapter } from '../openai';
import { ProviderAuthenticationError } from '../types';

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('OpenAI Adapter', () => {
  const adapter = new OpenAIAdapter();
  const credentials = { apiKey: 'sk-test' };
  const start = new Date('2026-01-01T00:00:00Z');
  const end = new Date('2026-01-02T00:00:00Z');

  beforeEach(() => {
    mockFetch.mockClear();
  });

  it('validates credentials successfully', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });
    const result = await adapter.validateCredentials(credentials);
    expect(result).toBe(true);
  });

  it('fails credential validation on 401', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401 });
    const result = await adapter.validateCredentials(credentials);
    expect(result).toBe(false);
  });

  it('fetches and normalizes usage correctly', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        object: 'list',
        data: [
          {
            aggregation_timestamp: 1696118400, // Oct 1, 2023
            project_id: 'proj_xyz',
            api_key_id: 'key_abc',
            model: 'gpt-4',
            n_requests: 10,
            n_context_tokens_total: 1000,
            n_generated_tokens_total: 200,
            n_context_tokens_in_cache_total: 100
          }
        ],
        has_more: false
      })
    });

    const events = await adapter.fetchUsage(credentials, start, end);
    
    expect(events.length).toBe(1);
    expect(events[0].provider).toBe('openai');
    expect(events[0].model).toBe('gpt-4');
    expect(events[0].usage.inputTokens).toBe(1000);
    expect(events[0].usage.outputTokens).toBe(200);
    expect(events[0].usage.cacheReadTokens).toBe(100);
    expect(events[0].usage.cacheCreationTokens).toBe(0);
    expect(events[0].attribution.tags?.project_id).toBe('proj_xyz');
    expect(events[0].attribution.apiKeyId).toBe('key_abc');
    expect(events[0].providerReference).toBeDefined(); // deterministic hash
  });

  it('throws ProviderAuthenticationError on 401 usage fetch', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401 });
    await expect(adapter.fetchUsage(credentials, start, end)).rejects.toThrow(ProviderAuthenticationError);
  });
});
