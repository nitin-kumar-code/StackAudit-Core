const { createClient } = require('@supabase/supabase-js');
const { randomUUID } = require('crypto');
const uuidv4 = randomUUID;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'fake-service-key-for-local-dev';
const supabase = createClient(supabaseUrl, supabaseKey);

async function seed() {
  console.log('Seeding Demo Data for Phase 9 Dashboard...');
  
  // 1. Create Organization
  const orgId = uuidv4();
  await supabase.from('organizations').insert({ id: orgId, name: 'Demo Corp (Phase 9)' });
  
  // 2. Create Workloads
  const wSupport = uuidv4();
  const wDoc = uuidv4();
  const wSales = uuidv4();
  
  await supabase.from('workloads').insert([
    { id: wSupport, organization_id: orgId, name: 'Support Triage', description: 'Automated ticket routing' },
    { id: wDoc, organization_id: orgId, name: 'Document Summarization', description: 'Internal wiki summarization' },
    { id: wSales, organization_id: orgId, name: 'Sales Research', description: 'Lead qualification insights' }
  ]);
  
  // 3. Attribution Rules
  const supportKey = uuidv4();
  const docKey = uuidv4();
  const salesKey = uuidv4();
  
  // Insert keys and bind them via attribution_rules (Phase 5 logic)
  await supabase.from('attribution_rules').insert([
    { organization_id: orgId, workload_id: wSupport, rule_type: 'API_KEY', rule_value: supportKey },
    { organization_id: orgId, workload_id: wDoc, rule_type: 'API_KEY', rule_value: docKey },
    { organization_id: orgId, workload_id: wSales, rule_type: 'API_KEY', rule_value: salesKey }
  ]);
  
  // 4. Usage Events (90 days)
  const now = new Date();
  const events = [];
  const outcomes = [];
  
  for (let i = 0; i < 90; i++) {
    const d = new Date(now.getTime() - i * 86400000);
    
    // Support Triage Usage
    events.push({
      organization_id: orgId,
      api_key_id: supportKey,
      provider: 'openai',
      model: 'gpt-4o',
      timestamp: d.toISOString(),
      input_tokens: 1500,
      output_tokens: 500,
      calculated_cost: 0.03, // $0.03
      is_unpriced: false
    });
    
    // Support Triage Outcomes (MULTI-TYPE to test C6)
    if (i % 2 === 0) {
      outcomes.push({
        organization_id: orgId,
        workload_id: wSupport,
        outcome_type: 'ticket_resolved',
        timestamp: d.toISOString(),
        count: 5
      });
      outcomes.push({
        organization_id: orgId,
        workload_id: wSupport,
        outcome_type: 'ticket_escalated',
        timestamp: d.toISOString(),
        count: 1
      });
    }

    // Doc Summarization Usage
    events.push({
      organization_id: orgId,
      api_key_id: docKey,
      provider: 'anthropic',
      model: 'claude-3-opus',
      timestamp: d.toISOString(),
      input_tokens: 8000,
      output_tokens: 2000,
      calculated_cost: 0.15,
      is_unpriced: false
    });
    outcomes.push({
      organization_id: orgId,
      workload_id: wDoc,
      outcome_type: 'document_summarized',
      timestamp: d.toISOString(),
      count: 2
    });
    
    // Unattributed Usage (No api_key_id)
    events.push({
      organization_id: orgId,
      api_key_id: null,
      provider: 'openai',
      model: 'gpt-3.5-turbo',
      timestamp: d.toISOString(),
      input_tokens: 400,
      output_tokens: 100,
      calculated_cost: 0.001,
      is_unpriced: false
    });

    // Unpriced Events (simulate missing price)
    events.push({
      organization_id: orgId,
      api_key_id: salesKey,
      provider: 'openai',
      model: 'gpt-future-v2',
      timestamp: d.toISOString(),
      input_tokens: 1000,
      output_tokens: 1000,
      calculated_cost: 0,
      is_unpriced: true,
      reprice_attempts: 1
    });
  }
  
  // Chunk insert to avoid request limits
  for (let i = 0; i < events.length; i += 100) {
    await supabase.from('usage_events').insert(events.slice(i, i + 100));
  }
  await supabase.from('outcome_events').insert(outcomes);
  
  // 5. Audit Findings (Mix of OPEN and RESOLVED)
  await supabase.from('audit_findings').insert([
    {
      organization_id: orgId,
      workload_id: wSupport,
      fingerprint: 'usage_spike_support_1',
      category: 'USAGE_SPIKE',
      severity: 'HIGH',
      status: 'OPEN',
      window_start: new Date(now.getTime() - 86400000).toISOString(),
      window_end: now.toISOString(),
      evidence: { baseline: 100, observed: 500, change: 4.0 },
      confidence: 'HIGH'
    },
    {
      organization_id: orgId,
      workload_id: wDoc,
      fingerprint: 'cost_drift_doc_1',
      category: 'COST_DRIFT',
      severity: 'MEDIUM',
      status: 'RESOLVED',
      window_start: new Date(now.getTime() - 7 * 86400000).toISOString(),
      window_end: new Date(now.getTime() - 6 * 86400000).toISOString(),
      evidence: { baseline_cost: 10, observed_cost: 15, drift: 0.5 },
      confidence: 'MEDIUM'
    }
  ]);
  
  // 6. Alerts
  await supabase.from('alerts').insert([
    {
      organization_id: orgId,
      fingerprint: 'alert_spike_support_1',
      category: 'USAGE_SPIKE',
      severity: 'HIGH',
      status: 'OPEN',
      workload_id: wSupport,
      first_triggered_at: new Date(now.getTime() - 86400000).toISOString(),
      last_triggered_at: now.toISOString(),
      metadata: { finding_fingerprints: ['usage_spike_support_1'] }
    },
    {
      organization_id: orgId,
      fingerprint: 'alert_drift_doc_1',
      category: 'COST_DRIFT',
      severity: 'MEDIUM',
      status: 'ACKNOWLEDGED',
      workload_id: wDoc,
      first_triggered_at: new Date(now.getTime() - 7 * 86400000).toISOString(),
      last_triggered_at: new Date(now.getTime() - 6 * 86400000).toISOString(),
      metadata: { finding_fingerprints: ['cost_drift_doc_1'] }
    }
  ]);
  
  // Write the Demo Org ID to .env.local automatically for seamless testing
  const fs = require('fs');
  fs.appendFileSync('.env.local', `\nDEMO_ORG_ID=${orgId}\n`);
  
  console.log('Seed complete! Org ID:', orgId);
  console.log('✅ Wrote DEMO_ORG_ID to .env.local automatically.');
}

seed().catch(console.error);
