import { describe, it, expect } from 'vitest';
import { parseCanonicalCsv } from '../csv';
import { InvalidUsageError } from '../../pricing';

describe('CSV Parser', () => {
  it('parses valid canonical CSV correctly', () => {
    const csvData = `provider,model,timestamp,input_tokens,output_tokens,cache_read_tokens,cache_creation_tokens,provider_reference
openai,gpt-4,2026-01-01T12:00:00Z,1000,200,50,0,ref_123
anthropic,claude-3,2026-01-02T12:00:00Z,500,100,0,150,ref_456`;

    const events = parseCanonicalCsv(csvData);
    expect(events.length).toBe(2);
    expect(events[0].provider).toBe('openai');
    expect(events[0].usage.inputTokens).toBe(1000);
    expect(events[0].usage.cacheReadTokens).toBe(50);
    expect(events[0].providerReference).toBe('ref_123');

    expect(events[1].usage.cacheCreationTokens).toBe(150);
  });

  it('handles empty cached tokens gracefully', () => {
    const csvData = `provider,model,timestamp,input_tokens,output_tokens,cache_read_tokens,provider_reference
openai,gpt-4,2026-01-01T12:00:00Z,1000,200,,ref_123`;
    const events = parseCanonicalCsv(csvData);
    expect(events[0].usage.cacheReadTokens).toBe(0);
    expect(events[0].usage.cacheCreationTokens).toBe(0);
  });

  it('throws InvalidUsageError if missing required columns', () => {
    const csvData = `provider,timestamp,input_tokens,output_tokens
openai,2026-01-01T12:00:00Z,1000,200`;
    expect(() => parseCanonicalCsv(csvData)).toThrow(InvalidUsageError);
  });
});
