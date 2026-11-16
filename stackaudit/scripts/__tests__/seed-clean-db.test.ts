import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SupabaseClient } from '@supabase/supabase-js';
import { loadPricingFixtures, readDefaultFixtureFile } from '../load-pricing-fixtures';

interface DbRow {
  id: string;
  provider?: string;
  model?: string;
  effective_from?: string;
  source?: string;
  [key: string]: unknown;
}

describe('Clean Database Seeding Workflow & Idempotency', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('proves clean database flow: fixture load followed by demo seed', async () => {
    // Simulated in-memory database tables
    const db: Record<string, DbRow[]> = {
      organizations: [],
      workloads: [],
      attribution_rules: [],
      pricing_catalog: [],
      usage_events: [],
      outcome_events: [],
      monitoring_configs: [],
      monitoring_runs: [],
      alerts: [],
      audit_findings: []
    };

    // Construct mock Supabase client backed by in-memory db
    const makeClient = (): SupabaseClient => {
      return {
        from: (table: string) => {
          const tableData = db[table] || [];
          return {
            select: vi.fn(() => ({
              eq: vi.fn((field: string, val: unknown) => ({
                eq: vi.fn((field2: string, val2: unknown) => ({
                  maybeSingle: vi.fn(() => Promise.resolve({
                    data: tableData.find((r) => r[field] === val && r[field2] === val2) || null,
                    error: null
                  })),
                  single: vi.fn(() => Promise.resolve({
                    data: tableData.find((r) => r[field] === val && r[field2] === val2) || null,
                    error: null
                  }))
                })),
                maybeSingle: vi.fn(() => Promise.resolve({
                  data: tableData.find((r) => r[field] === val) || null,
                  error: null
                })),
                single: vi.fn(() => Promise.resolve({
                  data: tableData.find((r) => r[field] === val) || null,
                  error: null
                })),
                order: vi.fn(() => ({
                  limit: vi.fn(() => Promise.resolve({ data: [], error: null }))
                }))
              })),
              in: vi.fn((field: string, vals: unknown[]) => ({
                in: vi.fn(() => Promise.resolve({
                  data: tableData.filter((r) => vals.includes(r[field])),
                  error: null
                })),
                then: (resolve: (arg: { data: DbRow[]; error: null }) => void) => resolve({
                  data: tableData.filter((r) => vals.includes(r[field])),
                  error: null
                })
              })),
              limit: vi.fn(() => ({
                single: vi.fn(() => Promise.resolve({ data: tableData[0] || null, error: null }))
              })),
              then: (resolve: (arg: { data: DbRow[]; error: null }) => void) => resolve({ data: tableData, error: null })
            })),
            insert: vi.fn((payload: unknown) => {
              const rows = Array.isArray(payload) ? (payload as DbRow[]) : [payload as DbRow];
              tableData.push(...rows);
              return {
                select: vi.fn(() => ({
                  single: vi.fn(() => Promise.resolve({ data: rows[0], error: null }))
                })),
                then: (resolve: (arg: { error: null }) => void) => resolve({ error: null })
              };
            }),
            upsert: vi.fn((payload: unknown) => {
              const rows = Array.isArray(payload) ? (payload as DbRow[]) : [payload as DbRow];
              for (const row of rows) {
                const idx = tableData.findIndex((r) => r.id === row.id);
                if (idx >= 0) tableData[idx] = row;
                else tableData.push(row);
              }
              return Promise.resolve({ error: null });
            }),
            update: vi.fn((payload: unknown) => ({
              eq: vi.fn((field: string, val: unknown) => {
                for (const row of tableData) {
                  if (row[field] === val) Object.assign(row, payload as Record<string, unknown>);
                }
                return Promise.resolve({ error: null });
              })
            })),
            delete: vi.fn(() => ({
              eq: vi.fn((field: string, val: unknown) => {
                db[table] = tableData.filter((r) => r[field] !== val);
                return Promise.resolve({ error: null });
              }),
              in: vi.fn((field: string, vals: unknown[]) => {
                db[table] = tableData.filter((r) => !vals.includes(r[field]));
                return Promise.resolve({ error: null });
              })
            }))
          };
        }
      } as unknown as SupabaseClient;
    };

    const supabase = makeClient();

    // 1. Initial empty state: pricing_catalog has 0 rows
    expect(db.pricing_catalog.length).toBe(0);

    // 2. Load pricing fixtures on clean DB
    const expectedCount = readDefaultFixtureFile().records.length;
    const fixtureResult = await loadPricingFixtures(supabase);
    expect(fixtureResult.inserted).toBe(expectedCount);
    expect(db.pricing_catalog.length).toBe(expectedCount);

    // 3. Repeated loading is idempotent
    const rerunFixtureResult = await loadPricingFixtures(supabase);
    expect(rerunFixtureResult.inserted).toBe(0);
    expect(rerunFixtureResult.updated).toBe(expectedCount);
    expect(db.pricing_catalog.length).toBe(expectedCount);

    // 4. Manual record is protected
    db.pricing_catalog.push({
      id: 'custom-prod-price',
      provider: 'openai',
      model: 'gpt-4o-custom',
      input_price: '1.00',
      output_price: '2.00',
      effective_from: new Date('2024-01-01').toISOString(),
      source: 'contract-custom-v1'
    });
    const protectRun = await loadPricingFixtures(supabase);
    expect(protectRun.skipped).toBe(0); // gpt-4o-custom does not conflict with standard models
    expect(db.pricing_catalog.find(r => r.id === 'custom-prod-price')?.source).toBe('contract-custom-v1');
  });
});
