import crypto from 'crypto';
import { CanonicalUsageEvent } from '../types';
import { InvalidUsageError } from '../pricing';

export interface CsvRowError { row: number; message: string; }
export interface CsvValidationResult { events: CanonicalUsageEvent[]; eventRows: Array<{ row: number; event: CanonicalUsageEvent }>; errors: CsvRowError[]; }

const REQUIRED = ['provider', 'model', 'timestamp', 'input_tokens', 'output_tokens', 'provider_reference'];
const OPTIONAL = ['cache_read_tokens', 'cache_creation_tokens', 'request_count', 'api_key_id'];
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/i;

function parseCsvRows(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = '', quoted = false;
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') { field += '"'; i++; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"' && field.length === 0) quoted = true;
    else if (char === ',') { row.push(field); field = ''; }
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && input[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some(value => value.trim() !== '')) rows.push(row);
      row = [];
    } else field += char;
  }
  if (quoted) throw new Error('CSV contains an unterminated quoted field.');
  if (field.length || row.length) { row.push(field); if (row.some(value => value.trim() !== '')) rows.push(row); }
  return rows;
}

function nonNegativeInteger(value: string | undefined, field: string, required = false): number {
  if ((value === undefined || value.trim() === '') && !required) return 0;
  if (!value || !/^\d+$/.test(value.trim())) throw new Error(`${field} must be a non-negative whole number.`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error(`${field} is outside the supported range.`);
  return parsed;
}

/** Parse and validate rows independently. CSV row numbers include the header. */
export function validateCanonicalCsv(csvContent: string): CsvValidationResult {
  let rows: string[][];
  try { rows = parseCsvRows(csvContent); }
  catch (error) { return { events: [], eventRows: [], errors: [{ row: 1, message: error instanceof Error ? error.message : 'Malformed CSV.' }] }; }
  if (!rows.length) return { events: [], eventRows: [], errors: [{ row: 1, message: 'CSV is empty.' }] };
  const headers = rows[0].map((value, index) => (index === 0 ? value.replace(/^\uFEFF/, '') : value).trim().toLowerCase());
  const duplicateHeaders = headers.filter((header, index) => headers.indexOf(header) !== index);
  if (duplicateHeaders.length) return { events: [], eventRows: [], errors: [{ row: 1, message: `Duplicate column: ${duplicateHeaders[0]}.` }] };
  const missing = REQUIRED.filter(header => !headers.includes(header));
  if (missing.length) return { events: [], eventRows: [], errors: [{ row: 1, message: `Missing required columns: ${missing.join(', ')}.` }] };
  const unknown = headers.filter(header => !REQUIRED.includes(header) && !OPTIONAL.includes(header));
  if (unknown.length) return { events: [], eventRows: [], errors: [{ row: 1, message: `Unsupported columns: ${unknown.join(', ')}.` }] };

  const events: CanonicalUsageEvent[] = [], errors: CsvRowError[] = [];
  const eventRows: Array<{ row: number; event: CanonicalUsageEvent }> = [];
  rows.slice(1).forEach((values, index) => {
    const rowNumber = index + 2;
    if (values.length !== headers.length) { errors.push({ row: rowNumber, message: `Expected ${headers.length} fields, found ${values.length}.` }); return; }
    const record = Object.fromEntries(headers.map((header, column) => [header, values[column].trim()]));
    try {
      const timestamp = new Date(record.timestamp);
      if (!record.provider || !record.model || !record.provider_reference) throw new Error('provider, model, and provider_reference are required.');
      if (!ISO_TIMESTAMP.test(record.timestamp) || !Number.isFinite(timestamp.getTime())) throw new Error('timestamp must be a valid ISO 8601 date/time with timezone.');
      const inputTokens = nonNegativeInteger(record.input_tokens, 'input_tokens', true);
      const outputTokens = nonNegativeInteger(record.output_tokens, 'output_tokens', true);
      const cacheReadTokens = nonNegativeInteger(record.cache_read_tokens, 'cache_read_tokens');
      const cacheCreationTokens = nonNegativeInteger(record.cache_creation_tokens, 'cache_creation_tokens');
      const requestCount = nonNegativeInteger(record.request_count, 'request_count');
      const rawResponseHash = crypto.createHash('sha256').update(JSON.stringify(record)).digest('hex');
      const event: CanonicalUsageEvent = {
        id: crypto.randomUUID(), provider: record.provider.toLowerCase(), model: record.model, timestamp,
        usage: { inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens, requestCount: requestCount || 1 },
        attribution: { apiKeyId: record.api_key_id || undefined }, providerReference: record.provider_reference,
        rawResponseHash, capturedAt: new Date()
      };
      events.push(event);
      eventRows.push({ row: rowNumber, event });
    } catch (error) { errors.push({ row: rowNumber, message: error instanceof Error ? error.message : 'Invalid row.' }); }
  });
  return { events, eventRows, errors };
}

/** Backwards-compatible strict parser for callers that require all rows valid. */
export function parseCanonicalCsv(csvContent: string): CanonicalUsageEvent[] {
  const result = validateCanonicalCsv(csvContent);
  if (result.errors.length) throw new InvalidUsageError(result.errors.map(error => `Row ${error.row}: ${error.message}`).join('\n'));
  return result.events;
}
