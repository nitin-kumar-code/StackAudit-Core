import { describe, it, expect, vi } from 'vitest';
import { SupabaseClient } from '@supabase/supabase-js';
import {
  readDefaultFixtureFile,
  validatePricingRecord,
  loadPricingFixtures,
  PricingFixtureRecord
} from '../../scripts/load-pricing-fixtures';

describe('Pricing Fixtures Catalog & Validation', () => {
  it('loads valid reference pricing file containing reviewed OpenAI and Anthropic models', () => {
    const fixtureFile = readDefaultFixtureFile();
    expect(fixtureFile.version).toBe('1.0.0');
    expect(fixtureFile.records.length).toBeGreaterThanOrEqual(4);

    const providers = new Set(fixtureFile.records.map(r => r.provider));
    expect(providers.has('openai')).toBe(true);
    expect(providers.has('anthropic')).toBe(true);

    const models = new Set(fixtureFile.records.map(r => r.model));
    expect(models.has('gpt-4o-mini')).toBe(true);
    expect(models.has('gpt-4o')).toBe(true);
    expect(models.has('claude-3-haiku-20240307')).toBe(true);
    expect(models.has('claude-3-sonnet-20240229')).toBe(true);
  });

  it('validates each record in reference-pricing-v1.json conforms to schema and provenance rules', () => {
    const fixtureFile = readDefaultFixtureFile();
    for (const record of fixtureFile.records) {
      expect(() => validatePricingRecord(record)).not.toThrow();
      expect(record.source).toMatch(/^sample-reference:/);
      expect(Number(record.input_price)).toBeGreaterThanOrEqual(0);
      expect(Number(record.output_price)).toBeGreaterThanOrEqual(0);
      if (record.cache_read_price != null) {
        expect(Number(record.cache_read_price)).toBeGreaterThanOrEqual(0);
      }
      if (record.cache_creation_price != null) {
        expect(Number(record.cache_creation_price)).toBeGreaterThanOrEqual(0);
      }
      expect(isNaN(new Date(record.effective_from).getTime())).toBe(false);
      if (record.effective_until) {
        expect(new Date(record.effective_until).getTime()).toBeGreaterThan(new Date(record.effective_from).getTime());
      }
    }
  });

  it('rejects records with negative prices or invalid date ranges', () => {
    const invalidPrice: PricingFixtureRecord = {
      id: 'inv-1',
      provider: 'openai',
      model: 'test',
      input_price: '-0.10',
      output_price: '0.50',
      effective_from: '2024-01-01T00:00:00.000Z',
      source: 'sample-reference:test'
    };
    expect(() => validatePricingRecord(invalidPrice)).toThrow(/cannot be negative/);

    const invalidDate: PricingFixtureRecord = {
      id: 'inv-2',
      provider: 'openai',
      model: 'test',
      input_price: '1.00',
      output_price: '2.00',
      effective_from: '2024-06-01T00:00:00.000Z',
      effective_until: '2024-01-01T00:00:00.000Z',
      source: 'sample-reference:test'
    };
    expect(() => validatePricingRecord(invalidDate)).toThrow(/must be after effective_from/);
  });
});

describe('Pricing Fixture Loading Engine (loadPricingFixtures)', () => {
  it('inserts all records on clean empty database', async () => {
    const insertedRows: Record<string, unknown>[] = [];
    const mockSupabase = {
      from: vi.fn((table: string) => {
        expect(table).toBe('pricing_catalog');
        return {
          select: vi.fn().mockResolvedValue({ data: [], error: null }),
          insert: vi.fn((payload) => {
            insertedRows.push(payload as Record<string, unknown>);
            return Promise.resolve({ error: null });
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null })
          })
        };
      })
    } as unknown as SupabaseClient;

    const fixtureFile = readDefaultFixtureFile();
    const result = await loadPricingFixtures(mockSupabase);
    expect(result.inserted).toBe(fixtureFile.records.length);
    expect(result.updated).toBe(0);
    expect(result.skipped).toBe(0);
    expect(insertedRows.length).toBe(fixtureFile.records.length);
    expect(insertedRows.every(r => String(r.source).startsWith('sample-reference:'))).toBe(true);
  });

  it('updates existing fixture records idempotently on repeated execution', async () => {
    const sampleFixtures: PricingFixtureRecord[] = [
      {
        id: 'fix-1',
        provider: 'openai',
        model: 'gpt-4o-mini',
        input_price: '0.15',
        output_price: '0.60',
        cache_read_price: '0.075',
        cache_creation_price: '0.00',
        effective_from: '2024-07-18T00:00:00.000Z',
        source: 'sample-reference:openai:gpt-4o-mini:2024-07-18'
      }
    ];

    const updatedRows: Record<string, unknown>[] = [];
    const mockSupabase = {
      from: vi.fn(() => ({
        select: vi.fn().mockResolvedValue({
          data: [
            {
              id: 'fix-1',
              provider: 'openai',
              model: 'gpt-4o-mini',
              effective_from: '2024-07-18T00:00:00.000Z',
              source: 'sample-reference:openai:gpt-4o-mini:2024-07-18'
            }
          ],
          error: null
        }),
        insert: vi.fn().mockResolvedValue({ error: null }),
        update: vi.fn((payload) => ({
          eq: vi.fn((field, val) => {
            updatedRows.push({ ...(payload as Record<string, unknown>), id: val });
            return Promise.resolve({ error: null });
          })
        }))
      }))
    } as unknown as SupabaseClient;

    const result = await loadPricingFixtures(mockSupabase, sampleFixtures);
    expect(result.inserted).toBe(0);
    expect(result.updated).toBe(1);
    expect(result.skipped).toBe(0);
    expect(updatedRows[0].id).toBe('fix-1');
  });

  it('NEVER overwrites manually maintained production pricing records', async () => {
    const sampleFixtures: PricingFixtureRecord[] = [
      {
        id: 'fix-1',
        provider: 'openai',
        model: 'gpt-4o-mini',
        input_price: '0.15',
        output_price: '0.60',
        cache_read_price: '0.075',
        cache_creation_price: '0.00',
        effective_from: '2024-07-18T00:00:00.000Z',
        source: 'sample-reference:openai:gpt-4o-mini:2024-07-18'
      }
    ];

    const updateFn = vi.fn();
    const mockSupabase = {
      from: vi.fn(() => ({
        select: vi.fn().mockResolvedValue({
          data: [
            {
              id: 'prod-custom-row',
              provider: 'openai',
              model: 'gpt-4o-mini',
              effective_from: '2024-07-18T00:00:00.000Z',
              source: 'manual-negotiated-contract-discount-2024'
            }
          ],
          error: null
        }),
        insert: vi.fn().mockResolvedValue({ error: null }),
        update: updateFn
      }))
    } as unknown as SupabaseClient;

    const result = await loadPricingFixtures(mockSupabase, sampleFixtures);
    expect(result.inserted).toBe(0);
    expect(result.updated).toBe(0);
    expect(result.skipped).toBe(1);
    expect(updateFn).not.toHaveBeenCalled();
  });
});
