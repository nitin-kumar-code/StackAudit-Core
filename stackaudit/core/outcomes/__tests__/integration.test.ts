import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { OutcomeService } from '../service';
import crypto from 'crypto';
import Big from 'big.js';

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY! This test is required for analytical guarantees and cannot be skipped.");
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);
const outcomeService = new OutcomeService(supabase);

describe('Outcome Analytics Integration (Cost Per Outcome)', () => {
  const orgId = crypto.randomUUID();
  const wlAId = crypto.randomUUID();
  const wlBId = crypto.randomUUID();
  const startTime = new Date('2026-09-01T00:00:00Z');
  const eventTime = new Date('2026-09-01T12:00:00Z'); 
  const endTime = new Date('2026-09-02T00:00:00Z'); 

  beforeAll(async () => {
    await supabase.from('organizations').insert({ id: orgId, name: 'Integration Org' });
    await supabase.from('workloads').insert([
      { id: wlAId, organization_id: orgId, name: 'WL A' },
      { id: wlBId, organization_id: orgId, name: 'WL B' }
    ]);
    
    await supabase.from('attribution_rules').insert([
      { organization_id: orgId, workload_id: wlAId, provider: 'test_provider', match_type: 'api_key', match_value: 'key_A' },
      { organization_id: orgId, workload_id: wlBId, provider: 'test_provider', match_type: 'api_key', match_value: 'key_B' }
    ]);

    await supabase.from('usage_events').insert([
      { id: crypto.randomUUID(), organization_id: orgId, provider: 'test_provider', model: 'test', timestamp: eventTime.toISOString(), input_tokens: 0, output_tokens: 0, provider_reference: 'ref_A1', api_key_id: 'key_A', calculated_cost: 60, raw_response_hash: 'hash' },
      { id: crypto.randomUUID(), organization_id: orgId, provider: 'test_provider', model: 'test', timestamp: eventTime.toISOString(), input_tokens: 0, output_tokens: 0, provider_reference: 'ref_A2', api_key_id: 'key_A', calculated_cost: 40, raw_response_hash: 'hash' },
      { id: crypto.randomUUID(), organization_id: orgId, provider: 'test_provider', model: 'test', timestamp: eventTime.toISOString(), input_tokens: 0, output_tokens: 0, provider_reference: 'ref_B1', api_key_id: 'key_B', calculated_cost: 50, raw_response_hash: 'hash' },
      { id: crypto.randomUUID(), organization_id: orgId, provider: 'test_provider', model: 'test', timestamp: eventTime.toISOString(), input_tokens: 0, output_tokens: 0, provider_reference: 'ref_U1', api_key_id: 'key_UNMATCHED', calculated_cost: 200, raw_response_hash: 'hash' },
    ]);
  });

  afterAll(async () => {
    await supabase.from('organizations').delete().eq('id', orgId);
  });

  it('correctly calculates independent Cost Per Outcome for distinct workloads, ignoring unattributed usage', async () => {
    await outcomeService.createOutcome(orgId, { workloadId: wlAId, outcomeType: 'ticket_resolved', timestamp: eventTime, count: 100, idempotencyKey: 'idem_A' });
    await outcomeService.createOutcome(orgId, { workloadId: wlBId, outcomeType: 'ticket_resolved', timestamp: eventTime, count: 10, idempotencyKey: 'idem_B' });

    const analyticsA = await outcomeService.getCostPerOutcome(orgId, wlAId, 'ticket_resolved', startTime, endTime);
    expect(Number(analyticsA.totalCost)).toBe(100);
    expect(analyticsA.totalOutcomeCount).toBe(100);
    expect(analyticsA.costPerOutcome).toBe('1'); 

    const analyticsB = await outcomeService.getCostPerOutcome(orgId, wlBId, 'ticket_resolved', startTime, endTime);
    expect(Number(analyticsB.totalCost)).toBe(50);
    expect(analyticsB.totalOutcomeCount).toBe(10);
    expect(analyticsB.costPerOutcome).toBe('5'); 
  });
  
  it('reconciliation: sum of daily series equals range aggregate', async () => {
    const seriesA = await outcomeService.getCostPerOutcomeSeries(orgId, wlAId, 'ticket_resolved', startTime, endTime);
    let seriesCost = 0;
    let seriesCount = 0;
    
    for (const dp of seriesA) {
      seriesCost += Number(dp.totalCost);
      seriesCount += dp.outcomeCount;
    }
    
    const analyticsA = await outcomeService.getCostPerOutcome(orgId, wlAId, 'ticket_resolved', startTime, endTime);
    
    expect(seriesCost).toBe(Number(analyticsA.totalCost));
    expect(seriesCount).toBe(analyticsA.totalOutcomeCount);
  });

  it('calculates zero cost safe cases properly', async () => {
    const wlEmptyId = crypto.randomUUID();
    await supabase.from('workloads').insert({ id: wlEmptyId, organization_id: orgId, name: 'WL Empty' });
    await outcomeService.createOutcome(orgId, { workloadId: wlEmptyId, outcomeType: 'ticket_resolved', timestamp: eventTime, count: 50 });

    const analyticsEmpty = await outcomeService.getCostPerOutcome(orgId, wlEmptyId, 'ticket_resolved', startTime, endTime);
    expect(Number(analyticsEmpty.totalCost)).toBe(0);
    expect(analyticsEmpty.totalOutcomeCount).toBe(50);
    expect(analyticsEmpty.costPerOutcome).toBe('0');
  });

  it('calculates zero outcome safe cases properly (null CPO)', async () => {
    const analyticsNoOutcome = await outcomeService.getCostPerOutcome(orgId, wlAId, 'different_type_entirely', startTime, endTime);
    expect(Number(analyticsNoOutcome.totalCost)).toBe(100);
    expect(analyticsNoOutcome.totalOutcomeCount).toBe(0);
    expect(analyticsNoOutcome.costPerOutcome).toBeNull();
  });
});
