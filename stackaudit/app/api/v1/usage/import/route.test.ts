import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ orgId: '10000000-0000-4000-8000-000000000001', existing: [] as Array<{ provider: string; provider_reference: string }>, saved: [] as unknown[] }));
vi.mock('../../../../../lib/auth', () => ({
  getAuthOrgId: vi.fn(async () => state.orgId),
  UnauthorizedError: class UnauthorizedError extends Error {},
  ForbiddenError: class ForbiddenError extends Error {}
}));
vi.mock('../../../../../core/usage/ingestion', () => ({
  ingestUsageEvents: vi.fn(async (events: unknown[], organizationId: string) => {
    state.saved.push({ organizationId, events });
    return { successful: events.length, pricingFailed: 0, errors: [] };
  })
}));
vi.mock('../../../../../lib/supabase/client', () => ({
  supabaseAdmin: {
    from: (table: string) => ({
      select: () => {
        const query: Record<string, unknown> = {};
        query.eq = vi.fn(() => query);
        query.in = vi.fn(() => query);
        query.then = (resolve: (value: unknown) => unknown) => resolve({
          data: table === 'usage_events' ? state.existing : [{ id: 'price-1', provider: 'openai', model: 'gpt-4o-mini', input_price: '1', output_price: '2', effective_from: '2020-01-01T00:00:00Z', effective_until: null, source: 'test' }], error: null
        });
        return query;
      }
    })
  }
}));

import { POST } from './route';

function upload(csv: string) {
  const form = new FormData();
  form.append('file', new File([csv], 'usage.csv', { type: 'text/csv' }));
  return new Request('http://localhost/api/v1/usage/import', { method: 'POST', body: form });
}
const header = 'provider,model,timestamp,input_tokens,output_tokens,provider_reference';

describe('CSV usage import API', () => {
  beforeEach(() => { state.existing = []; state.saved = []; });

  it('imports valid rows into only the configured workspace', async () => {
    const response = await POST(upload(`${header},api_key_id\nopenai,gpt-4o-mini,2026-10-01T12:00:00Z,20,5,ref-a,key-demo`));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toMatchObject({ accepted: 1, rejected: 0, imported: 1, unpriced: 0 });
    expect(state.saved).toHaveLength(1);
    expect(state.saved[0]).toMatchObject({ organizationId: state.orgId });
    expect((state.saved[0] as { events: Array<{ attribution: { apiKeyId?: string } }> }).events[0].attribution.apiKeyId).toBe('key-demo');
  });

  it('returns row-level errors and keeps valid rows in a partial import', async () => {
    const response = await POST(upload(`${header}\nopenai,gpt-4o-mini,2026-10-01T12:00:00Z,20,5,ref-a\nopenai,gpt-4o-mini,bad,-1,5,ref-b`));
    const body = await response.json();
    expect(response.status).toBe(207);
    expect(body).toMatchObject({ accepted: 1, rejected: 1, imported: 1 });
    expect(body.errors[0]).toMatchObject({ row: 3 });
  });

  it('skips previously imported records and repeated rows', async () => {
    state.existing = [{ provider: 'openai', provider_reference: 'ref-old' }];
    const response = await POST(upload(`${header}\nopenai,gpt-4o-mini,2026-10-01T12:00:00Z,20,5,ref-old\nopenai,gpt-4o-mini,2026-10-01T12:00:00Z,20,5,ref-new\nopenai,gpt-4o-mini,2026-10-01T12:00:00Z,20,5,ref-new`));
    const body = await response.json();
    expect(body).toMatchObject({ accepted: 1, rejected: 2, imported: 1, duplicates: 2 });
    expect(state.saved).toHaveLength(1);
  });

  it('rejects an invalid header before attempting persistence', async () => {
    const response = await POST(upload('provider,model\nopenai,gpt-4o'));
    expect(response.status).toBe(400);
    expect(state.saved).toHaveLength(0);
  });
});
