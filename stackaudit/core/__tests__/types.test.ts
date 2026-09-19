import { describe, it, expect } from 'vitest';
import { CanonicalUsageEvent } from '../types';

describe('Domain Types', () => {
  it('should allow creating a CanonicalUsageEvent placeholder', () => {
    const event: CanonicalUsageEvent = {
      id: 'event-1',
      provider: 'openai',
      model: 'gpt-4',
      timestamp: new Date(),
      usage: { inputTokens: 10, outputTokens: 20 },
      attribution: {},
      providerReference: 'ref-1'
    };
    expect(event.id).toBe('event-1');
  });
});
