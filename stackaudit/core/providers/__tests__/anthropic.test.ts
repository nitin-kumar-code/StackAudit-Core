import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AnthropicAdapter } from '../anthropic';
import { ProviderAuthenticationError } from '../types';

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('Anthropic Adapter', () => {
  const adapter = new AnthropicAdapter();
  const credentials = { apiKey: 'sk-ant-admin-test' };
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

  it('throws authentication error on 401', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401 });
    await expect(adapter.fetchUsage(credentials, start, end)).rejects.toThrow(ProviderAuthenticationError);
  });

  it('normalizes mock usage correctly and builds granular providerReference', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        data: [
          {
            bucket_start: '2026-01-01T00:00:00Z',
            model: 'claude-3-opus',
            api_key: 'key_123',
            workspace: 'ws_456',
            input_tokens: 500,
            output_tokens: 50,
            cache_read_input_tokens: 100,
            cache_creation_input_tokens: 200
          }
        ],
        has_more: false
      })
    });

    const events = await adapter.fetchUsage(credentials, start, end);
    
    expect(events.length).toBe(1);
    expect(events[0].provider).toBe('anthropic');
    expect(events[0].model).toBe('claude-3-opus');
    expect(events[0].usage.inputTokens).toBe(500);
    expect(events[0].usage.cacheReadTokens).toBe(100);
    expect(events[0].usage.cacheCreationTokens).toBe(200);
    expect(events[0].attribution.apiKeyId).toBe('key_123');
    expect(events[0].attribution.tags?.workspace_id).toBe('ws_456');
    expect(events[0].providerReference).toBeDefined();
  });
});
