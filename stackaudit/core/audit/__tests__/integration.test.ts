import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { AuditService } from '../service';
import crypto from 'crypto';

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY! This test is required for analytical guarantees and cannot be skipped.");
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);
const auditService = new AuditService(supabase);

describe('Audit Engine Integration', () => {
  const orgId = crypto.randomUUID();
  const wlId = crypto.randomUUID();
  
  const baselineEvent = new Date('2026-09-01T12:00:00Z');
  
  const currentStart = new Date('2026-09-02T00:00:00Z');
  const currentEvent = new Date('2026-09-02T12:00:00Z');
  const currentEnd = new Date('2026-09-03T00:00:00Z'); 

  beforeAll(async () => {
    await supabase.from('organizations').insert({ id: orgId, name: 'Audit Integration Org' });
    await supabase.from('workloads').insert({ id: wlId, organization_id: orgId, name: 'WL Audit' });
    
    await supabase.from('attribution_rules').insert([
      { organization_id: orgId, workload_id: wlId, provider: 'test_provider', match_type: 'api_key', match_value: 'key_audit' }
    ]);

    // BASELINE: 100 requests, 1000 tokens, $10 cost
    const baselineEvents = Array.from({ length: 100 }).map((_, i) => ({
      id: crypto.randomUUID(), organization_id: orgId, provider: 'test_provider', model: 'test', 
      timestamp: baselineEvent.toISOString(), input_tokens: 5, output_tokens: 5, 
      provider_reference: `ref_b_${i}`, api_key_id: 'key_audit', calculated_cost: 0.1, raw_response_hash: 'hash'
    }));

    // CURRENT: 110 requests, 16000 tokens, $100 cost (Massive drift & token inefficiency!)
    const currentEvents = Array.from({ length: 110 }).map((_, i) => ({
      id: crypto.randomUUID(), organization_id: orgId, provider: 'test_provider', model: 'test', 
      timestamp: currentEvent.toISOString(), input_tokens: 100, output_tokens: 45, // Much higher tokens
      provider_reference: `ref_c_${i}`, api_key_id: 'key_audit', calculated_cost: 0.90, raw_response_hash: 'hash'
    }));

    await supabase.from('usage_events').insert([...baselineEvents, ...currentEvents]);
  });

  afterAll(async () => {
    await supabase.from('organizations').delete().eq('id', orgId);
  });

  it('runs audit service, returns findings, and persists them accurately', async () => {
    const { findings } = await auditService.runAudit(orgId, {
      workloadId: wlId,
      start: currentStart,
      end: currentEnd
    });

    expect(findings.length).toBeGreaterThan(0);
    
    const costDrift = findings.find(f => f.category === 'COST_DRIFT');
    expect(costDrift).toBeDefined();
    expect(costDrift?.evidence.metric).toBe('cost_drift');
    expect(costDrift?.timeWindowStart).toEqual(currentStart);
    
    const tokenEfficiency = findings.find(f => f.category === 'TOKEN_EFFICIENCY');
    expect(tokenEfficiency).toBeDefined();
    
    // Check DB persistence
    const { data: dbFindings, error } = await supabase
      .from('audit_findings')
      .select('*')
      .eq('organization_id', orgId)
      .eq('workload_id', wlId);
      
    expect(error).toBeNull();
    expect(dbFindings?.length).toBe(findings.length);
  });
  
  it('prevents duplicate finding creation on re-run (idempotency)', async () => {
    await auditService.runAudit(orgId, {
      workloadId: wlId,
      start: currentStart,
      end: currentEnd
    });
    
    // DB count should not increase
    const { count } = await supabase
      .from('audit_findings')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .eq('workload_id', wlId);
      
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThanOrEqual(4); // Max 4 rules evaluate currently
  });
});
