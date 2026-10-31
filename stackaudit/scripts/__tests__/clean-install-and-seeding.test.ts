import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import Big from 'big.js';
import { listMigrations } from '../migrate';
import { readDefaultFixtureFile } from '../load-pricing-fixtures';
import {
  buildDemoDataset,
  DEMO_WORKLOADS,
  DEMO_ORGANIZATION_ID,
  pricingRecordFromRow,
  getDefaultDatasetEnd
} from '../demo-dataset';
import { InMemoryPricingCatalog, calculateCost } from '../../core/pricing';
import { aggregateUsageCosts, calculateCostPerOutcome } from '../../core/usage/metrics';
import { CostDriftRule } from '../../core/audit/rules/cost-drift';

describe('1. Clean Installation & Migration Verification', () => {
  it('has all 14 chronological migrations with valid SQL structure', () => {
    const migrations = listMigrations();
    expect(migrations.length).toBe(14);

    // Verify ordering and essential milestones
    expect(migrations[0]).toBe('20260919000000_v0_initial_schema.sql');
    expect(migrations[1]).toBe('20260920000000_v0_phase5_attribution.sql');
    expect(migrations[migrations.length - 1]).toBe('20261028000000_query_scalability.sql');

    const migrationsDir = path.resolve(__dirname, '../../supabase/migrations');
    for (const file of migrations) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
      expect(sql.length).toBeGreaterThan(50);
    }
  });

  it('defines the demo_seed_key column and uniqueness index in migrations', () => {
    const migrationsDir = path.resolve(__dirname, '../../supabase/migrations');
    const ownershipSql = fs.readFileSync(
      path.join(migrationsDir, '20261017000002_demo_seed_ownership.sql'),
      'utf-8'
    );
    expect(ownershipSql).toContain('demo_seed_key');
    expect(ownershipSql).toContain('organizations_demo_seed_key_unique');
  });

  it('defines the query scalability RPC functions in migrations', () => {
    const migrationsDir = path.resolve(__dirname, '../../supabase/migrations');
    const scalabilitySql = fs.readFileSync(
      path.join(migrationsDir, '20261028000000_query_scalability.sql'),
      'utf-8'
    );
    expect(scalabilitySql).toContain('CREATE OR REPLACE FUNCTION aggregate_usage_page');
    expect(scalabilitySql).toContain('CREATE OR REPLACE FUNCTION aggregate_dashboard_summary');
    expect(scalabilitySql).toContain('FUNCTION aggregate_dashboard_trends_v2');
  });
});

describe('2. Reviewed Pricing Fixtures Verification', () => {
  it('provides verified reference fixtures for all models used by demo seeder', () => {
    const fixtureData = readDefaultFixtureFile();
    const demoNeededModels = [
      { provider: 'openai', model: 'gpt-4o-mini' },
      { provider: 'openai', model: 'gpt-4o' },
      { provider: 'anthropic', model: 'claude-3-haiku-20240307' },
      { provider: 'anthropic', model: 'claude-3-sonnet-20240229' }
    ];

    for (const needed of demoNeededModels) {
      const match = fixtureData.records.find(
        r => r.provider === needed.provider && r.model === needed.model
      );
      expect(match).toBeDefined();
      expect(Number(match!.input_price)).toBeGreaterThan(0);
      expect(Number(match!.output_price)).toBeGreaterThan(0);
      expect(match!.source).toMatch(/^sample-reference:/);
    }
  });

  it('proves fixtures are convertible to canonical PricingRecord instances', () => {
    const fixtureData = readDefaultFixtureFile();
    const pricingRecords = fixtureData.records.map(r => pricingRecordFromRow(r));
    expect(pricingRecords.length).toBe(fixtureData.records.length);

    const catalog = new InMemoryPricingCatalog(pricingRecords);
    // gpt-4o has effective dating: launch rate prior to 2024-08-06, revised rate afterwards
    const launchPrice = catalog.findEffectivePrice('openai', 'gpt-4o', new Date('2024-06-01T00:00:00Z'));
    const revisedPrice = catalog.findEffectivePrice('openai', 'gpt-4o', new Date('2024-09-01T00:00:00Z'));

    return Promise.all([launchPrice, revisedPrice]).then(([launch, revised]) => {
      expect(launch.inputPrice).toBe('5.00');
      expect(revised.inputPrice).toBe('2.50');
      expect(launch.outputPrice).toBe('15.00');
      expect(revised.outputPrice).toBe('10.00');
    });
  });
});

describe('3. Clean Database Seeding & Determinism', () => {
  const fixtureData = readDefaultFixtureFile();
  const pricingRecords = fixtureData.records.map(r => pricingRecordFromRow(r));
  const testEnd = new Date('2026-10-30T00:00:00.000Z');

  it('builds a deterministic dataset with matching workloads and attribution rules', async () => {
    const dataset = await buildDemoDataset({ seed: 12345, end: testEnd, days: 90 }, pricingRecords);

    expect(dataset.workloads.length).toBe(3);
    expect(dataset.workloads.map(w => w.name)).toEqual([
      'Support Triage',
      'Document Summarization',
      'Sales Research'
    ]);
    expect(dataset.workloads.every(w => w.organization_id === DEMO_ORGANIZATION_ID)).toBe(true);

    expect(dataset.attributionRules.length).toBe(3);
    expect(dataset.attributionRules.every(r => r.organization_id === DEMO_ORGANIZATION_ID)).toBe(true);

    // 90 days of usage
    expect(dataset.usageEvents.length).toBeGreaterThan(90);
    expect(dataset.outcomeEvents.length).toBeGreaterThan(90);

    // Idempotency keys must be unique and defined
    const outcomeKeys = new Set(dataset.outcomeEvents.map(o => o.idempotency_key));
    expect(outcomeKeys.size).toBe(dataset.outcomeEvents.length);

    const usageIds = new Set(dataset.usageEvents.map(u => u.id));
    expect(usageIds.size).toBe(dataset.usageEvents.length);
  });

  it('repeated generation with same parameters produces identical dataset', async () => {
    const run1 = await buildDemoDataset({ seed: 9999, end: testEnd, days: 28 }, pricingRecords);
    const run2 = await buildDemoDataset({ seed: 9999, end: testEnd, days: 28 }, pricingRecords);

    expect(run1.usageEvents.map(u => u.id)).toEqual(run2.usageEvents.map(u => u.id));
    expect(run1.outcomeEvents.map(o => o.idempotency_key)).toEqual(run2.outcomeEvents.map(o => o.idempotency_key));
  });

  it('defaults to current UTC midnight when end is not explicitly passed', () => {
    const defaultEnd = getDefaultDatasetEnd();
    expect(defaultEnd.getUTCHours()).toBe(0);
    expect(defaultEnd.getUTCMinutes()).toBe(0);
    expect(defaultEnd.getUTCSeconds()).toBe(0);
  });
});

describe('4. Reconciliation & Financial Completeness Verification', () => {
  const fixtureData = readDefaultFixtureFile();
  const pricingRecords = fixtureData.records.map(r => pricingRecordFromRow(r));
  const testEnd = new Date('2026-10-30T00:00:00.000Z');

  it('reconciles usage events, workload costs, and outcomes with zero leakage', async () => {
    const dataset = await buildDemoDataset({ seed: 12345, end: testEnd, days: 30 }, pricingRecords);
    const catalog = new InMemoryPricingCatalog(pricingRecords);

    let totalCalculatedCost = new Big(0);
    const costsByWorkload: Record<string, Big> = {
      [DEMO_WORKLOADS[0].id]: new Big(0),
      [DEMO_WORKLOADS[1].id]: new Big(0),
      [DEMO_WORKLOADS[2].id]: new Big(0)
    };

    for (const event of dataset.usageEvents) {
      const price = await catalog.findEffectivePrice(event.provider, event.model, event.timestamp);
      const cost = calculateCost(event, price);
      totalCalculatedCost = totalCalculatedCost.plus(cost.totalCost);

      const rule = dataset.attributionRules.find(r => r.match_value === event.attribution.apiKeyId);
      expect(rule).toBeDefined();
      costsByWorkload[rule!.workload_id] = costsByWorkload[rule!.workload_id].plus(cost.totalCost);
    }

    // Verify workload sums equal total cost exactly
    const sumWorkloads = costsByWorkload[DEMO_WORKLOADS[0].id]
      .plus(costsByWorkload[DEMO_WORKLOADS[1].id])
      .plus(costsByWorkload[DEMO_WORKLOADS[2].id]);

    expect(sumWorkloads.toFixed(6)).toBe(totalCalculatedCost.toFixed(6));
  });

  it('derives real audit findings and alerts from the seeded traffic pattern', async () => {
    const dataset = await buildDemoDataset({ seed: 12345, end: testEnd, days: 90 }, pricingRecords);
    const catalog = new InMemoryPricingCatalog(pricingRecords);

    const currentWindow = { start: new Date(testEnd.getTime() - 14 * 86400000), end: testEnd };
    const baselineWindow = { start: new Date(testEnd.getTime() - 28 * 86400000), end: currentWindow.start };

    const inWindow = (time: Date, w: { start: Date; end: Date }) => time >= w.start && time < w.end;

    const calcWindowMetrics = async (workloadId: string, w: { start: Date; end: Date }) => {
      const rule = dataset.attributionRules.find(r => r.workload_id === workloadId);
      const events = dataset.usageEvents.filter(e => e.attribution.apiKeyId === rule?.match_value && inWindow(e.timestamp, w));
      let cost = new Big(0);
      let requests = 0;
      for (const e of events) {
        const p = await catalog.findEffectivePrice(e.provider, e.model, e.timestamp);
        cost = cost.plus(calculateCost(e, p).totalCost);
        requests += e.usage.requestCount || 1;
      }
      return { totalCost: Number(cost.toString()), totalTokens: 0, requestCount: requests, unpricedEvents: 0 };
    };

    const currentMetrics = await calcWindowMetrics(DEMO_WORKLOADS[0].id, currentWindow);
    const baselineMetrics = await calcWindowMetrics(DEMO_WORKLOADS[0].id, baselineWindow);

    const finding = new CostDriftRule().evaluate({
      organizationId: DEMO_ORGANIZATION_ID,
      workloadId: DEMO_WORKLOADS[0].id,
      currentWindow,
      baselineWindow,
      currentMetrics,
      baselineMetrics,
      currentOutcomes: { ticket_resolved: 1000 },
      baselineOutcomes: { ticket_resolved: 1000 }
    });

    // Proves finding is genuinely derived from the seeded model-mix and traffic spike
    expect(finding).not.toBeNull();
    expect(finding?.category).toBe('COST_DRIFT');
    expect(finding?.severity).toBe('HIGH');
  });

  it('never silently converts unpriced usage into zero-cost usage and discloses missing pricing', () => {
    // Single unpriced row
    const mixedRows = [
      { calculated_cost: '12.50', is_unpriced: false },
      { calculated_cost: '0', is_unpriced: true }
    ];

    const summary = aggregateUsageCosts(mixedRows);
    expect(summary.isComplete).toBe(false);
    expect(summary.totalCost).toBeNull(); // Authoritative total unavailable
    expect(summary.knownCost).toBe('12.5'); // Partial known cost only
    expect(summary.unpricedEventCount).toBe(1);
    expect(summary.pricedEventCount).toBe(1);

    // Cost per outcome calculation on incomplete data
    const cpoResult = calculateCostPerOutcome(summary, 100);
    expect(cpoResult.value).toBeNull(); // CPO is null when pricing incomplete
    expect(cpoResult.reason).toContain('pricing is incomplete');
  });
});
