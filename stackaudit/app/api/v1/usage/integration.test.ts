import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import Big from 'big.js';
import crypto from 'crypto';
import { OutcomeService } from '../../../../core/outcomes/service';

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY; database analytics integration tests require the local service-role key.');
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321';
if (!['localhost', '127.0.0.1'].includes(new URL(supabaseUrl).hostname)) {
  throw new Error('Analytics integration tests may only write to a local Supabase database.');
}

const supabase = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY);
const organizationId = crypto.randomUUID();
const otherOrganizationId = crypto.randomUUID();
const workloadAId = crypto.randomUUID();
const workloadBId = crypto.randomUUID();
const outcomeOnlyWorkloadId = crypto.randomUUID();
const costOnlyWorkloadId = crypto.randomUUID();
const start = new Date('2026-10-01T00:00:00.000Z');
const end = new Date('2026-10-02T00:00:00.000Z');
const datasetSize = 1200;

interface UsageFixture {
  id: string;
  organization_id: string;
  provider: string;
  model: string;
  timestamp: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
  request_count: number;
  provider_reference: string;
  api_key_id: string;
  calculated_cost: string;
  is_unpriced: boolean;
  raw_response_hash: string;
}

const usageRows: UsageFixture[] = [];

function fixtureRow(
  reference: string,
  timestamp: Date,
  provider: string,
  model: string,
  apiKeyId: string,
  inputTokens: number,
  outputTokens: number,
  requestCount: number,
  cost: string,
  isUnpriced: boolean
): UsageFixture {
  return {
    id: crypto.randomUUID(),
    organization_id: organizationId,
    provider,
    model,
    timestamp: timestamp.toISOString(),
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cache_read_tokens: 3,
    cache_creation_tokens: 1,
    request_count: requestCount,
    provider_reference: reference,
    api_key_id: apiKeyId,
    calculated_cost: cost,
    is_unpriced: isUnpriced,
    raw_response_hash: 'analytics-fixture'
  };
}

function rpcUsagePage(options: {
  page?: number;
  pageSize?: number;
  provider?: string | null;
  model?: string | null;
  workloadId?: string | null;
  startTime?: Date;
  endTime?: Date;
} = {}) {
  return supabase.rpc('aggregate_usage_page', {
    p_organization_id: organizationId,
    p_start_time: (options.startTime || start).toISOString(),
    p_end_time: (options.endTime || end).toISOString(),
    p_provider: options.provider || null,
    p_model: options.model || null,
    p_workload_id: options.workloadId || null,
    p_page: options.page || 1,
    p_page_size: options.pageSize || 50
  });
}

function assertNoError(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

describe('Database analytics aggregation and pagination', () => {
  beforeAll(async () => {
    const orgInsert = await supabase.from('organizations').insert([
      { id: organizationId, name: 'Query Scalability Fixture' },
      { id: otherOrganizationId, name: 'Isolated Analytics Fixture' }
    ]);
    assertNoError(orgInsert.error);
    const workloadInsert = await supabase.from('workloads').insert([
      { id: workloadAId, organization_id: organizationId, name: 'Analytics workload A' },
      { id: workloadBId, organization_id: organizationId, name: 'Analytics workload B' },
      { id: outcomeOnlyWorkloadId, organization_id: organizationId, name: 'Outcome only workload' },
      { id: costOnlyWorkloadId, organization_id: organizationId, name: 'Cost only workload' }
    ]);
    assertNoError(workloadInsert.error);
    const rulesInsert = await supabase.from('attribution_rules').insert([
      { organization_id: organizationId, workload_id: workloadAId, provider: 'openai', match_type: 'api_key', match_value: 'key-a' },
      { organization_id: organizationId, workload_id: workloadBId, provider: 'openai', match_type: 'api_key', match_value: 'key-b' },
      { organization_id: organizationId, workload_id: workloadBId, provider: 'anthropic', match_type: 'api_key', match_value: 'key-b' },
      { organization_id: organizationId, workload_id: costOnlyWorkloadId, provider: 'openai', match_type: 'api_key', match_value: 'key-cost-only' }
    ]);
    assertNoError(rulesInsert.error);

    for (let index = 0; index < datasetSize; index++) {
      const bucket = index % 4;
      const provider = bucket < 2 ? 'openai' : 'anthropic';
      const model = bucket === 0 ? 'gpt-4' : bucket === 1 ? 'gpt-mini' : 'claude';
      const apiKeyId = bucket === 0 ? 'key-a' : bucket === 1 || bucket === 2 ? 'key-b' : 'unmapped-key';
      const isUnpriced = index % 148 === 2;
      usageRows.push(fixtureRow(
        `dataset-${index}`,
        new Date(start.getTime() + Math.floor(index / 4) * 1000),
        provider,
        model,
        apiKeyId,
        10,
        5,
        index % 3 + 1,
        isUnpriced ? '0.0000' : '0.0100',
        isUnpriced
      ));
    }
    usageRows.push(fixtureRow('boundary-start', start, 'anthropic', 'claude', 'key-b', 100, 2, 7, '0.5000', true));
    usageRows.push(fixtureRow('boundary-end', end, 'anthropic', 'claude', 'key-b', 500, 1, 9, '1.0000', false));
    usageRows.push(fixtureRow('cost-only-workload', new Date(start.getTime() + 30_000), 'openai', 'gpt-4', 'key-cost-only', 21, 8, 2, '0.7500', false));

    for (let offset = 0; offset < usageRows.length; offset += 200) {
      const result = await supabase.from('usage_events').insert(usageRows.slice(offset, offset + 200));
      assertNoError(result.error);
    }
    const isolatedUsage = await supabase.from('usage_events').insert({
      id: crypto.randomUUID(), organization_id: otherOrganizationId, provider: 'openai', model: 'isolated',
      timestamp: new Date(start.getTime() + 1_000).toISOString(), input_tokens: 900, output_tokens: 100,
      cache_read_tokens: 0, cache_creation_tokens: 0, request_count: 100, provider_reference: 'other-org-only',
      calculated_cost: 999, raw_response_hash: 'isolated-fixture', is_unpriced: false
    });
    assertNoError(isolatedUsage.error);

    const outcomeInsert = await supabase.from('outcome_events').insert([
      { organization_id: organizationId, workload_id: workloadAId, outcome_type: 'ticket_resolved', timestamp: new Date(start.getTime() + 10_000).toISOString(), count: 9 },
      { organization_id: organizationId, workload_id: workloadAId, outcome_type: 'ticket_resolved', timestamp: new Date(start.getTime() + 11_000).toISOString(), count: 2 },
      { organization_id: organizationId, workload_id: workloadAId, outcome_type: 'lead_created', timestamp: new Date(start.getTime() + 12_000).toISOString(), count: 5 },
      { organization_id: organizationId, workload_id: workloadBId, outcome_type: 'ticket_resolved', timestamp: new Date(start.getTime() + 20_000).toISOString(), count: 3 },
      { organization_id: organizationId, workload_id: workloadBId, outcome_type: 'ticket_resolved', timestamp: end.toISOString(), count: 100 },
      { organization_id: organizationId, workload_id: outcomeOnlyWorkloadId, outcome_type: 'ticket_resolved', timestamp: new Date(start.getTime() + 30_000).toISOString(), count: 4 },
      { organization_id: organizationId, workload_id: outcomeOnlyWorkloadId, outcome_type: 'lead_created', timestamp: new Date(start.getTime() + 31_000).toISOString(), count: 6 }
    ]);
    assertNoError(outcomeInsert.error);
  }, 120_000);

  afterAll(async () => {
    await supabase.from('organizations').delete().in('id', [organizationId, otherOrganizationId]);
  });

  it('filters before pagination, uses a stable timestamp/id order, and summarizes all matching pages', async () => {
    const options = { provider: 'anthropic', model: 'claude', workloadId: workloadBId, pageSize: 50 };
    const first = await rpcUsagePage(options);
    const repeatedFirst = await rpcUsagePage(options);
    const second = await rpcUsagePage({ ...options, page: 2 });
    assertNoError(first.error);
    assertNoError(repeatedFirst.error);
    assertNoError(second.error);

    const body = first.data as { events: Array<{ id: string; provider: string; model: string; workload_id: string; calculated_cost: string }>; summary: Record<string, unknown>; pagination: { total: number; totalPages: number; limit: number } };
    const repeatedBody = repeatedFirst.data as typeof body;
    const secondBody = second.data as typeof body;
    const expected = usageRows.filter(row => row.timestamp >= start.toISOString() && row.timestamp < end.toISOString()
      && row.provider === 'anthropic' && row.model === 'claude' && row.api_key_id === 'key-b');
    const expectedKnownCost = expected.reduce((total, row) => total.plus(row.is_unpriced ? 0 : row.calculated_cost), new Big(0));

    expect(body.events).toHaveLength(50);
    expect(body.events.every(row => row.provider === 'anthropic' && row.model === 'claude' && row.workload_id === workloadBId)).toBe(true);
    expect(body.events.map(row => row.id)).toEqual(repeatedBody.events.map(row => row.id));
    expect(body.events.map(row => row.id).some(id => secondBody.events.some(row => row.id === id))).toBe(false);
    expect(body.summary.totalEvents).toBe(expected.length);
    expect(body.summary.totalRequests).toBe(expected.reduce((total, row) => total + row.request_count, 0));
    expect(body.summary.totalTokens).toBe(expected.reduce((total, row) => total + row.input_tokens + row.output_tokens, 0));
    expect(new Big(String(body.summary.knownCost)).eq(expectedKnownCost)).toBe(true);
    expect(body.summary.unpricedEventCount).toBe(expected.filter(row => row.is_unpriced).length);
    expect(body.summary.totalCost).toBeNull();
    expect(body.pagination).toEqual({ page: 1, limit: 50, total: expected.length, totalPages: Math.ceil(expected.length / 50) });
    expect(typeof body.events[0].calculated_cost).toBe('string');
  });

  it('preserves the half-open range, empty pages, and empty-result summary', async () => {
    const allEvents = await rpcUsagePage({ pageSize: 100 });
    const startBoundary = await rpcUsagePage({
      provider: 'anthropic', model: 'claude', workloadId: workloadBId,
      startTime: start, endTime: new Date(start.getTime() + 1000)
    });
    const empty = await rpcUsagePage({ provider: 'provider-does-not-exist' });
    const beyondEnd = await rpcUsagePage({ provider: 'anthropic', page: 999, pageSize: 100 });
    assertNoError(allEvents.error);
    assertNoError(empty.error);
    assertNoError(beyondEnd.error);

    const allBody = allEvents.data as { events: Array<{ id: string }>; summary: { totalEvents: number } };
    const startBody = startBoundary.data as { events: Array<{ id: string }>; summary: { totalEvents: number } };
    const emptyBody = empty.data as { events: unknown[]; summary: { totalEvents: number; totalRequests: number; knownCost: string; totalCost: string; isCostComplete: boolean }; pagination: { totalPages: number } };
    const beyondBody = beyondEnd.data as { events: unknown[]; summary: { totalEvents: number }; pagination: { total: number } };
    expect(allBody.summary.totalEvents).toBe(datasetSize + 2);
    expect(startBody.summary.totalEvents).toBe(2);
    expect(startBody.events.some(row => row.id === usageRows.at(-2)?.id)).toBe(true);
    expect(allBody.events.some(row => row.id === usageRows.at(-1)?.id)).toBe(false);
    expect(emptyBody.events).toEqual([]);
    expect(emptyBody.summary).toMatchObject({ totalEvents: 0, totalRequests: 0, knownCost: '0', totalCost: '0', isCostComplete: true });
    expect(emptyBody.pagination.totalPages).toBe(0);
    expect(beyondBody.events).toEqual([]);
    expect(beyondBody.summary.totalEvents).toBe(beyondBody.pagination.total);
  });

  it('rejects a duplicate provider reference while isolating organization totals', async () => {
    const duplicate = await supabase.from('usage_events').insert({
      ...usageRows[0], id: crypto.randomUUID()
    });
    expect(duplicate.error?.code).toBe('23505');

    const result = await supabase.rpc('aggregate_dashboard_summary', {
      p_organization_id: organizationId,
      p_start_time: start.toISOString(),
      p_end_time: end.toISOString()
    });
    assertNoError(result.error);
    const body = result.data as { summary: { totalTokens: number; totalCost: string | null } };
    expect(body.summary.totalTokens).toBe(usageRows
      .filter(row => row.timestamp >= start.toISOString() && row.timestamp < end.toISOString())
      .reduce((total, row) => total + row.input_tokens + row.output_tokens, 0));
    expect(body.summary.totalTokens).toBeLessThan(1000);
  });

  it('reconciles dashboard, trend, workload, provider/model, and outcome aggregates', async () => {
    const [dashboard, trends, outcomes] = await Promise.all([
      supabase.rpc('aggregate_dashboard_summary', {
        p_organization_id: organizationId,
        p_start_time: start.toISOString(),
        p_end_time: end.toISOString()
      }),
      supabase.rpc('aggregate_dashboard_trends_v2', {
        p_organization_id: organizationId,
        p_start_time: start.toISOString(),
        p_end_time: end.toISOString()
      }),
      supabase.rpc('aggregate_outcome_analytics', {
        p_organization_id: organizationId,
        p_start_time: start.toISOString(),
        p_end_time: end.toISOString()
      })
    ]);
    assertNoError(dashboard.error);
    assertNoError(trends.error);
    assertNoError(outcomes.error);

    const dashboardBody = dashboard.data as {
      summary: { totalTokens: number; totalRequests: number; totalOutcomes: number; totalCost: string | null; knownCost: string | null };
      workloads: Array<{ id: string; usage: number; totalRequests: number; outcomes: number; knownCost: string | null; cost: string | null }>;
      unattributed: { usage: number; totalRequests: number; eventCount: number };
    };
    const trendRows = trends.data as Array<{ total_tokens: string; request_count: number; outcome_count: string; total_cost: string | null }>;
    const outcomeRows = outcomes.data as Array<{ workload_id: string; workload_name: string; outcome_type: string; total_outcomes: string; total_cost: string | null }>;
    expect(dashboardBody.summary.totalCost).toBeNull();
    expect(dashboardBody.summary.knownCost).not.toBeNull();
    expect(dashboardBody.workloads.reduce((sum, row) => sum + row.usage, 0) + dashboardBody.unattributed.usage).toBe(dashboardBody.summary.totalTokens);
    expect(dashboardBody.workloads.reduce((sum, row) => sum + row.totalRequests, 0) + dashboardBody.unattributed.totalRequests).toBe(dashboardBody.summary.totalRequests);
    expect(dashboardBody.summary.totalOutcomes).toBe(29);
    expect(trendRows).toHaveLength(1);
    expect(Number(trendRows[0].total_tokens)).toBe(dashboardBody.summary.totalTokens);
    expect(trendRows[0].request_count).toBe(dashboardBody.summary.totalRequests);
    expect(Number(trendRows[0].outcome_count)).toBe(dashboardBody.summary.totalOutcomes);
    expect(trendRows[0].total_cost).toBeNull();

    for (const workload of dashboardBody.workloads) {
      const usage = await rpcUsagePage({ workloadId: workload.id, pageSize: 100 });
      assertNoError(usage.error);
      const usageBody = usage.data as { summary: { totalTokens: number; totalRequests: number; totalCost: string | null; knownCost: string | null } };
      expect(usageBody.summary.totalTokens).toBe(workload.usage);
      expect(usageBody.summary.totalRequests).toBe(workload.totalRequests);
      expect(usageBody.summary.totalCost).toBe(workload.cost);
      expect(usageBody.summary.knownCost).toBe(workload.knownCost);
    }

    for (const field of ['provider', 'model'] as const) {
      const values = [...new Set(usageRows.filter(row => row.timestamp < end.toISOString()).map(row => row[field]))];
      let tokenSum = 0;
      let requestSum = 0;
      for (const value of values) {
        const result = await rpcUsagePage({ [field]: value, pageSize: 100 });
        assertNoError(result.error);
        const body = result.data as { summary: { totalTokens: number; totalRequests: number } };
        tokenSum += body.summary.totalTokens;
        requestSum += body.summary.totalRequests;
      }
      expect(tokenSum).toBe(dashboardBody.summary.totalTokens);
      expect(requestSum).toBe(dashboardBody.summary.totalRequests);
    }

    expect(outcomeRows).toHaveLength(5);
    expect(outcomeRows.find(row => row.workload_id === workloadAId)?.total_cost)
      .not.toBe(outcomeRows.find(row => row.workload_id === workloadBId)?.total_cost);
    expect(outcomeRows.find(row => row.workload_id === workloadAId && row.outcome_type === 'ticket_resolved'))
      .toMatchObject({ total_outcomes: '11', outcome_type_count: 2 });
    expect(outcomeRows.find(row => row.workload_id === workloadAId && row.outcome_type === 'lead_created'))
      .toMatchObject({ total_outcomes: '5', outcome_type_count: 2 });
    expect(outcomeRows.find(row => row.workload_id === outcomeOnlyWorkloadId))
      .toMatchObject({ total_cost: '0', outcome_type_count: 2 });
    expect(outcomeRows.every(row => row.workload_id !== costOnlyWorkloadId)).toBe(true);

    const outcomeService = new OutcomeService(supabase);
    const multiType = await outcomeService.getCostPerOutcome(organizationId, outcomeOnlyWorkloadId, 'ticket_resolved', start, end);
    expect(multiType.totalCost).toBe('0');
    expect(multiType.costPerOutcome).toBeNull();
    expect(multiType.availabilityReason).toMatch(/multiple outcome types/);
    const dailySeries = await outcomeService.getCostPerOutcomeSeries(
      organizationId, outcomeOnlyWorkloadId, 'ticket_resolved', start, new Date('2026-10-04T00:00:00.000Z')
    );
    expect(dailySeries).toHaveLength(3);
    expect(dailySeries[0].costPerOutcome).toBeNull();
    expect(dailySeries[0].availabilityReason).toMatch(/multiple outcome types/);
    expect(dailySeries.slice(1).map(point => point.costPerOutcome)).toEqual([null, null]);
  });

  it('measures raw-row versus bounded aggregate payloads on a deterministic dataset', async () => {
    const beforeStarted = performance.now();
    const before = await supabase.from('usage_events').select('*')
      .eq('organization_id', organizationId)
      .gte('timestamp', start.toISOString())
      .lt('timestamp', end.toISOString())
      .order('timestamp', { ascending: false });
    const beforeMilliseconds = performance.now() - beforeStarted;
    assertNoError(before.error);

    const afterStarted = performance.now();
    const after = await rpcUsagePage({ pageSize: 100 });
    const afterMilliseconds = performance.now() - afterStarted;
    assertNoError(after.error);

    const rawRows = before.data || [];
    const aggregate = after.data as { events: unknown[]; summary: { totalEvents: number } };
    const rawPayloadBytes = Buffer.byteLength(JSON.stringify(rawRows));
    const aggregatePayloadBytes = Buffer.byteLength(JSON.stringify(aggregate));
    console.info(JSON.stringify({
      analyticsMeasurement: {
        deterministicDatasetRowsInRange: datasetSize + 2,
        legacyRawRowsReturnedByPostgrest: rawRows.length,
        boundedRpcEventsReturned: aggregate.events.length,
        legacyRawPayloadBytes: rawPayloadBytes,
        boundedAggregatePayloadBytes: aggregatePayloadBytes,
        legacyRawQueryMilliseconds: Number(beforeMilliseconds.toFixed(2)),
        boundedRpcQueryMilliseconds: Number(afterMilliseconds.toFixed(2)),
        productionUsageDatabaseCalls: 1
      }
    }));

    expect(aggregate.summary.totalEvents).toBe(datasetSize + 2);
    expect(aggregate.events.length).toBe(100);
    expect(aggregatePayloadBytes).toBeLessThan(rawPayloadBytes);
  });
});
