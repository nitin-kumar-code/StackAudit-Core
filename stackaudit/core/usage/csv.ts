import crypto from 'crypto';
import { CanonicalUsageEvent } from '../types';
import { InvalidUsageError } from '../pricing';

export function parseCanonicalCsv(csvContent: string): CanonicalUsageEvent[] {
  const lines = csvContent.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  const headerLine = lines[0].toLowerCase();
  const headers = headerLine.split(',').map(h => h.trim());

  const requiredHeaders = ['provider', 'model', 'timestamp', 'input_tokens', 'output_tokens', 'provider_reference'];
  for (const req of requiredHeaders) {
    if (!headers.includes(req)) {
      throw new InvalidUsageError(`CSV missing required column: ${req}`);
    }
  }

  const events: CanonicalUsageEvent[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    const values = line.split(',').map(v => v.trim());
    
    const record: Record<string, string> = {};
    headers.forEach((h, idx) => {
      record[h] = values[idx] || '';
    });

    const timestamp = new Date(record.timestamp);
    if (isNaN(timestamp.getTime())) {
      throw new InvalidUsageError(`Invalid timestamp on row ${i + 1}: ${record.timestamp}`);
    }

    const inputTokens = parseInt(record.input_tokens, 10);
    const outputTokens = parseInt(record.output_tokens, 10);
    const cacheReadTokens = record.cache_read_tokens ? parseInt(record.cache_read_tokens, 10) : 0;
    const cacheCreationTokens = record.cache_creation_tokens ? parseInt(record.cache_creation_tokens, 10) : 0;

    if (isNaN(inputTokens) || isNaN(outputTokens) || isNaN(cacheReadTokens) || isNaN(cacheCreationTokens)) {
      throw new InvalidUsageError(`Invalid token count on row ${i + 1}`);
    }

    if (!record.provider || !record.model || !record.provider_reference) {
      throw new InvalidUsageError(`Missing required string fields on row ${i + 1}`);
    }

    const rawPayloadStr = JSON.stringify(record);
    const rawResponseHash = crypto.createHash('sha256').update(rawPayloadStr).digest('hex');

    events.push({
      id: crypto.randomUUID(),
      provider: record.provider,
      model: record.model,
      timestamp,
      usage: {
        inputTokens,
        outputTokens,
        cacheReadTokens,
        cacheCreationTokens
      },
      attribution: {},
      providerReference: record.provider_reference,
      rawResponseHash,
      capturedAt: new Date()
    });
  }

  return events;
}
