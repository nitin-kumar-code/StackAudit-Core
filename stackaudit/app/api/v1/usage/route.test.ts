import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

const { rpc, organizationId } = vi.hoisted(() => ({
  rpc: vi.fn(),
  organizationId: '10000000-0000-4000-8000-000000000001'
}));

vi.mock('../../../../lib/supabase/client', () => ({ supabaseAdmin: { rpc } }));
vi.mock('../../../../lib/auth', () => ({
  getAuthOrgId: vi.fn(async () => organizationId),
  UnauthorizedError: class UnauthorizedError extends Error {},
  ForbiddenError: class ForbiddenError extends Error {}
}));

const aggregateResponse = {
  events: [],
  summary: {
    totalRequests: 0,
    totalTokens: 0,
    totalCost: '0',
    knownCost: '0',
    isCostComplete: true,
    pricedEventCount: 0,
    unpricedEventCount: 0,
    totalEvents: 0
  },
  filters: { providers: [], models: [], workloads: [] },
  pagination: { page: 1, limit: 50, total: 0, totalPages: 0 }
};

function request(params: Record<string, string> = {}) {
  const url = new URL('http://localhost/api/v1/usage');
  url.searchParams.set('start', '2026-10-01T00:00:00.000Z');
  url.searchParams.set('end', '2026-10-02T00:00:00.000Z');
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return new Request(url);
}

describe('Usage API query bounds and aggregation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rpc.mockResolvedValue({ data: aggregateResponse, error: null });
  });

  it('uses one database aggregation with the default bounded page size', async () => {
    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(aggregateResponse);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('aggregate_usage_page', {
      p_organization_id: organizationId,
      p_start_time: '2026-10-01T00:00:00.000Z',
      p_end_time: '2026-10-02T00:00:00.000Z',
      p_provider: null,
      p_model: null,
      p_workload_id: null,
      p_page: 1,
      p_page_size: 50
    });
  });

  it('passes filters before page selection and accepts the maximum page size', async () => {
    const workloadId = '20000000-0000-4000-8000-000000000001';
    const response = await GET(request({ provider: 'openai', model: 'gpt-4', workloadId, page: '3', limit: '100' }));

    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith('aggregate_usage_page', expect.objectContaining({
      p_provider: 'openai',
      p_model: 'gpt-4',
      p_workload_id: workloadId,
      p_page: 3,
      p_page_size: 100
    }));
  });

  const invalidQueries: Array<{ params: Record<string, string>; description: string }> = [
    { params: { limit: '101' }, description: 'maximum page size' },
    { params: { limit: '0' }, description: 'positive page size' },
    { params: { limit: '50rows' }, description: 'integer page size' },
    { params: { page: '-1' }, description: 'positive page' },
    { params: { page: '1000001' }, description: 'bounded page' },
    { params: { workloadId: 'not-a-uuid' }, description: 'valid workload id' },
    { params: { start: 'invalid-date' }, description: 'valid date' },
    { params: { start: '2026-10-02T00:00:00.000Z' }, description: 'ordered range' },
    { params: { end: '2027-10-03T00:00:00.000Z' }, description: 'maximum date range' }
  ];

  it.each(invalidQueries)('rejects invalid query values ($description)', async ({ params }) => {
    const response = await GET(request(params));

    expect(response.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('keeps empty-page totals and page boundaries from the database response', async () => {
    const emptyResponse = {
      ...aggregateResponse,
      summary: { ...aggregateResponse.summary, totalEvents: 120 },
      pagination: { page: 5, limit: 50, total: 120, totalPages: 3 }
    };
    rpc.mockResolvedValue({ data: emptyResponse, error: null });

    const response = await GET(request({ page: '5' }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.events).toEqual([]);
    expect(body.summary.totalEvents).toBe(120);
    expect(body.pagination).toEqual({ page: 5, limit: 50, total: 120, totalPages: 3 });
  });
});
