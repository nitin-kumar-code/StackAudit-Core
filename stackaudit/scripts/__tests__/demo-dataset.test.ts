import { describe, expect, it, vi } from 'vitest';
import { calculateCost, InMemoryPricingCatalog } from '../../core/pricing';
import { ingestUsageEvents } from '../../core/usage/ingestion';
import { CanonicalUsageEvent, PricingRecord } from '../../core/types';
import { CostDriftRule } from '../../core/audit/rules/cost-drift';
import Big from 'big.js';
import {
  buildDemoDataset,
  DEMO_DATASET_DAYS,
  DEMO_ORGANIZATION_ID,
  DEMO_WORKLOADS,
  assertDemoOwnedRows,
  resolveDemoTarget,
  runCleanupSteps
} from '../demo-dataset';

const END = new Date('2026-10-17T00:00:00.000Z');
const pricing: PricingRecord[] = [
  { id: 'p-openai-mini', provider: 'openai', model: 'gpt-4o-mini', inputPrice: '0.15', outputPrice: '0.60', effectiveFrom: new Date('2020-01-01T00:00:00Z'), source: 'test fixture' },
  { id: 'p-openai-full', provider: 'openai', model: 'gpt-4o', inputPrice: '5', outputPrice: '15', effectiveFrom: new Date('2020-01-01T00:00:00Z'), source: 'test fixture' },
  { id: 'p-anthropic-haiku', provider: 'anthropic', model: 'claude-3-haiku-20240307', inputPrice: '0.25', outputPrice: '1.25', effectiveFrom: new Date('2020-01-01T00:00:00Z'), source: 'test fixture' },
  { id: 'p-anthropic-sonnet', provider: 'anthropic', model: 'claude-3-sonnet-20240229', inputPrice: '3', outputPrice: '15', effectiveFrom: new Date('2020-01-01T00:00:00Z'), source: 'test fixture' }
];

describe('deterministic demo dataset', () => {
  it('builds the same logical records for the same seed and explicit date range', async () => {
    const first = await buildDemoDataset({ seed: 7341, end: END }, pricing);
    const second = await buildDemoDataset({ seed: 7341, end: END }, pricing);
    expect(first).toEqual(second);
    expect(first.start.toISOString()).toBe('2026-07-19T00:00:00.000Z');
    expect(first.end.toISOString()).toBe(END.toISOString());
    expect(first.usageEvents.every(event => event.timestamp >= first.start && event.timestamp < first.end)).toBe(true);
    expect(new Set(first.usageEvents.map(event => event.id)).size).toBe(first.usageEvents.length);
  });

  it('keeps usage attribution, workload ownership, and outcome type scopes aligned', async () => {
    const dataset = await buildDemoDataset({ seed: 12345, end: END }, pricing);
    expect(dataset.workloads.map(workload => workload.id)).toEqual(DEMO_WORKLOADS.map(workload => workload.id));
    for (const event of dataset.usageEvents) {
      const rule = dataset.attributionRules.find(item => item.match_value === event.attribution.apiKeyId);
      expect(rule?.provider).toBe(event.provider);
      expect(dataset.workloads.some(workload => workload.id === rule?.workload_id)).toBe(true);
    }
    expect(new Set(dataset.outcomeEvents.map(event => `${event.workload_id}:${event.outcome_type}`))).toEqual(new Set([
      `${DEMO_WORKLOADS[0].id}:ticket_resolved`,
      `${DEMO_WORKLOADS[1].id}:document_processed`,
      `${DEMO_WORKLOADS[2].id}:research_completed`
    ]));
    expect(dataset.outcomeEvents.every(event => event.organization_id === DEMO_ORGANIZATION_ID)).toBe(true);
  });

  it('fails before writes when an applicable catalog price is missing', async () => {
    await expect(buildDemoDataset({ seed: 1, end: END }, [])).rejects.toThrow(/pricing_catalog/);
  });

  it('sends generated canonical usage through the shared pricing and ingestion services', async () => {
    const dataset = await buildDemoDataset({ seed: 12345, end: END, days: 28 }, pricing);
    const event = dataset.usageEvents[0];
    const catalog = new InMemoryPricingCatalog(pricing);
    const record = await catalog.findEffectivePrice(event.provider, event.model, event.timestamp);
    const expected = calculateCost(event, record).totalCost;
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const supabase = { from: vi.fn(() => ({ upsert })) } as never;

    const result = await ingestUsageEvents([event], DEMO_ORGANIZATION_ID, catalog, supabase);
    expect(result.errors).toEqual([]);
    expect(result.pricingFailed).toBe(0);
    expect(upsert.mock.calls[0][0][0]).toMatchObject({ calculated_cost: expected, is_unpriced: false, captured_at: event.timestamp.toISOString() });
  });

  it('derives the support cost-drift finding from generated usage and outcomes', async () => {
    const dataset = await buildDemoDataset({ seed: 12345, end: END }, pricing);
    const catalog = new InMemoryPricingCatalog(pricing);
    const currentWindow = { start: new Date(END.getTime() - 14 * 86400000), end: END };
    const baselineWindow = { start: new Date(END.getTime() - 28 * 86400000), end: currentWindow.start };
    const inWindow = (time: Date, window: { start: Date; end: Date }) => time >= window.start && time < window.end;
    const summarize = async (window: { start: Date; end: Date }) => {
      const events = dataset.usageEvents.filter(event => event.attribution.apiKeyId === dataset.attributionRules[0].match_value && inWindow(event.timestamp, window));
      let totalCost = new Big(0);
      let requests = 0;
      for (const event of events) {
        totalCost = totalCost.plus(calculateCost(event, await catalog.findEffectivePrice(event.provider, event.model, event.timestamp)).totalCost);
        requests += event.usage.requestCount || 0;
      }
      return { totalCost: Number(totalCost.toString()), totalTokens: 0, requestCount: requests, unpricedEvents: 0 };
    };
    const outcomesFor = (window: { start: Date; end: Date }) => dataset.outcomeEvents
      .filter(event => event.workload_id === DEMO_WORKLOADS[0].id && inWindow(new Date(event.timestamp), window))
      .reduce<Record<string, number>>((counts, event) => {
        counts[event.outcome_type] = (counts[event.outcome_type] || 0) + event.count;
        return counts;
      }, {});

    const finding = new CostDriftRule().evaluate({
      organizationId: DEMO_ORGANIZATION_ID,
      workloadId: DEMO_WORKLOADS[0].id,
      currentWindow,
      baselineWindow,
      currentMetrics: await summarize(currentWindow),
      baselineMetrics: await summarize(baselineWindow),
      currentOutcomes: outcomesFor(currentWindow),
      baselineOutcomes: outcomesFor(baselineWindow)
    });
    expect(finding?.category).toBe('COST_DRIFT');
  });

  it('keeps failed pricing explicitly unpriced instead of treating its placeholder as a real zero', async () => {
    const event: CanonicalUsageEvent = {
      id: 'event-no-price', provider: 'openai', model: 'unknown-model', timestamp: END,
      usage: { inputTokens: 100, outputTokens: 10, requestCount: 1 }, attribution: { apiKeyId: 'demo-key' },
      providerReference: 'demo:no-price', rawResponseHash: 'hash', capturedAt: END
    };
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const supabase = { from: vi.fn(() => ({ upsert })) } as never;
    const result = await ingestUsageEvents([event], DEMO_ORGANIZATION_ID, new InMemoryPricingCatalog(), supabase);
    expect(result.pricingFailed).toBe(1);
    expect(upsert.mock.calls[0][0][0]).toMatchObject({ calculated_cost: '0', is_unpriced: true });
  });

  it('does not depend on the real current date for the default scenario length', () => {
    expect(DEMO_DATASET_DAYS).toBe(90);
  });
});

describe('demo seed safety', () => {
  it('permits loopback targets and refuses remote targets by default', () => {
    expect(resolveDemoTarget('http://127.0.0.1:54321', false)).toBe('local');
    expect(() => resolveDemoTarget('https://project.supabase.co', false)).toThrow(/Refusing to seed a remote/);
  });

  it('requires an exact host pin before remote seeding can be enabled', () => {
    expect(() => resolveDemoTarget('https://project.supabase.co', true)).toThrow(/EXPECTED_REMOTE_HOST/);
    expect(() => resolveDemoTarget('https://project.supabase.co', true, 'other.supabase.co')).toThrow(/exactly match/);
    expect(resolveDemoTarget('https://project.supabase.co', true, 'project.supabase.co')).toBe('remote');
  });

  it('refuses to adopt deterministic workload or rule IDs owned by another organization', () => {
    expect(() => assertDemoOwnedRows([{ id: 'collision', organization_id: 'another-org' }], 'workload')).toThrow(/belongs to another organization/);
    expect(() => assertDemoOwnedRows([{ id: 'demo-row', organization_id: DEMO_ORGANIZATION_ID }], 'workload')).not.toThrow();
  });

  it('stops cleanup at the first failed operation', async () => {
    const second = vi.fn().mockResolvedValue({ error: null });
    await expect(runCleanupSteps([
      async () => ({ error: { message: 'delete denied' } }),
      second
    ])).rejects.toThrow(/delete denied/);
    expect(second).not.toHaveBeenCalled();
  });
});
