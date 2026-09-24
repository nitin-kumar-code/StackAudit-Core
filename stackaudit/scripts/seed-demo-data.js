const { createClient } = require('@supabase/supabase-js');
const { randomUUID } = require('crypto');
const fs = require('fs');
const uuidv4 = randomUUID;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'fake-service-key-for-local-dev';
const supabase = createClient(supabaseUrl, supabaseKey);

async function seed() {
  console.log('Seeding Demo Data for Phase 9 Dashboard...');
  console.log('Using Supabase URL:', supabaseUrl);
  
  // 1. Create Organization
  const orgId = uuidv4();
  const { error: orgErr } = await supabase.from('organizations').insert({ id: orgId, name: 'Demo Corp (Phase 9)' });
  if (orgErr) { console.error('❌ Failed to create organization:', orgErr); process.exit(1); }
  console.log('✅ Created organization:', orgId);
  
  // 2. Create Workloads
  const wSupport = uuidv4();
  const wDoc = uuidv4();
  const wSales = uuidv4();
  
  const { error: wlErr } = await supabase.from('workloads').insert([
    { id: wSupport, organization_id: orgId, name: 'Support Triage', description: 'Automated ticket routing' },
    { id: wDoc, organization_id: orgId, name: 'Document Summarization', description: 'Internal wiki summarization' },
    { id: wSales, organization_id: orgId, name: 'Sales Research', description: 'Lead qualification insights' }
  ]);
  if (wlErr) { console.error('❌ Failed to create workloads:', wlErr); process.exit(1); }
  console.log('✅ Created 3 workloads');
  
  // 3. Attribution Rules (schema: id, workload_id, match_type, match_value, organization_id, provider)
  const supportKey = uuidv4();
  const docKey = uuidv4();
  const salesKey = uuidv4();
  
  const { error: arErr } = await supabase.from('attribution_rules').insert([
    { organization_id: orgId, workload_id: wSupport, match_type: 'API_KEY', match_value: supportKey, provider: 'openai' },
    { organization_id: orgId, workload_id: wDoc, match_type: 'API_KEY', match_value: docKey, provider: 'anthropic' },
    { organization_id: orgId, workload_id: wSales, match_type: 'API_KEY', match_value: salesKey, provider: 'openai' }
  ]);
  if (arErr) { console.error('❌ Failed to create attribution rules:', arErr); process.exit(1); }
  console.log('✅ Created attribution rules');
  
  // 4. Usage Events (90 days of realistic data)
  const now = new Date();
  const events = [];
  const outcomes = [];
  
  function mkEvent(overrides) {
    return {
      id: uuidv4(),
      organization_id: orgId,
      provider_reference: uuidv4(),
      raw_response_hash: uuidv4(),
      cache_read_tokens: 0,
      cache_creation_tokens: 0,
      request_count: 1,
      reprice_attempts: 0,
      ...overrides,
    };
  }

  for (let i = 0; i < 90; i++) {
    const d = new Date(now.getTime() - i * 86400000);
    
    // Support Triage — GPT-4o, daily cost ~$0.03
    events.push(mkEvent({
      api_key_id: supportKey,
      provider: 'openai',
      model: 'gpt-4o',
      timestamp: d.toISOString(),
      input_tokens: 1500,
      output_tokens: 500,
      calculated_cost: 0.03,
    }));
    
    // Support outcomes
    if (i % 2 === 0) {
      outcomes.push({
        workload_id: wSupport,
        outcome_type: 'ticket_resolved',
        timestamp: d.toISOString(),
        count: 5
      });
      outcomes.push({
        workload_id: wSupport,
        outcome_type: 'ticket_escalated',
        timestamp: d.toISOString(),
        count: 1
      });
    }

    // Doc Summarization — Claude, daily cost ~$0.15
    events.push(mkEvent({
      api_key_id: docKey,
      provider: 'anthropic',
      model: 'claude-3-opus',
      timestamp: d.toISOString(),
      input_tokens: 8000,
      output_tokens: 2000,
      calculated_cost: 0.15,
    }));
    outcomes.push({
      workload_id: wDoc,
      outcome_type: 'document_summarized',
      timestamp: d.toISOString(),
      count: 2
    });
    
    // Unattributed usage — cheap GPT-3.5
    events.push(mkEvent({
      api_key_id: null,
      provider: 'openai',
      model: 'gpt-3.5-turbo',
      timestamp: d.toISOString(),
      input_tokens: 400,
      output_tokens: 100,
      calculated_cost: 0.001,
    }));

    // Unpriced events (future model)
    events.push(mkEvent({
      api_key_id: salesKey,
      provider: 'openai',
      model: 'gpt-future-v2',
      timestamp: d.toISOString(),
      input_tokens: 1000,
      output_tokens: 1000,
      calculated_cost: 0,
      reprice_attempts: 1
    }));
  }
  
  // Chunk insert usage_events
  let insertedEvents = 0;
  for (let i = 0; i < events.length; i += 100) {
    const { error: evErr } = await supabase.from('usage_events').insert(events.slice(i, i + 100));
    if (evErr) { console.error('❌ Failed to insert usage_events chunk:', evErr); process.exit(1); }
    insertedEvents += Math.min(100, events.length - i);
  }
  console.log(`✅ Inserted ${insertedEvents} usage events`);

  // Chunk insert outcome_events
  for (let i = 0; i < outcomes.length; i += 100) {
    const { error: outErr } = await supabase.from('outcome_events').insert(outcomes.slice(i, i + 100));
    if (outErr) { console.error('❌ Failed to insert outcome_events chunk:', outErr); process.exit(1); }
  }
  console.log(`✅ Inserted ${outcomes.length} outcome events`);
  
  // 5. Audit Findings (schema: organization_id, workload_id, category, severity, status, title, description, confidence, evidence, time_window_start, time_window_end)
  const { error: afErr } = await supabase.from('audit_findings').insert([
    {
      organization_id: orgId,
      workload_id: wSupport,
      category: 'USAGE_SPIKE',
      severity: 'HIGH',
      status: 'OPEN',
      title: 'Usage spike on Support Triage',
      description: 'Token usage for Support Triage increased 400% over baseline in the last 24 hours.',
      detected_at: now.toISOString(),
      time_window_start: new Date(now.getTime() - 86400000).toISOString(),
      time_window_end: now.toISOString(),
      evidence: { baseline: 100, observed: 500, change: 4.0 },
      confidence: 'HIGH'
    },
    {
      organization_id: orgId,
      workload_id: wDoc,
      category: 'COST_DRIFT',
      severity: 'MEDIUM',
      status: 'RESOLVED',
      title: 'Cost drift on Document Summarization',
      description: 'Daily cost increased 50% vs 7-day baseline.',
      detected_at: new Date(now.getTime() - 6 * 86400000).toISOString(),
      time_window_start: new Date(now.getTime() - 7 * 86400000).toISOString(),
      time_window_end: new Date(now.getTime() - 6 * 86400000).toISOString(),
      evidence: { baseline_cost: 10, observed_cost: 15, drift: 0.5 },
      confidence: 'MEDIUM'
    }
  ]);
  if (afErr) { console.error('❌ Failed to insert audit_findings:', afErr); process.exit(1); }
  console.log('✅ Inserted audit findings');

  // Get finding IDs for alert references
  const { data: findings } = await supabase.from('audit_findings').select('id').eq('organization_id', orgId).limit(2);
  const findingIds = (findings || []).map(f => f.id);
  
  // 6. Alerts (schema: organization_id, workload_id, finding_id, category, severity, status, fingerprint)
  const { error: alErr } = await supabase.from('alerts').insert([
    {
      organization_id: orgId,
      workload_id: wSupport,
      finding_id: findingIds[0] || null,
      category: 'USAGE_SPIKE',
      severity: 'HIGH',
      status: 'OPEN',
      fingerprint: 'alert_spike_support_1',
    },
    {
      organization_id: orgId,
      workload_id: wDoc,
      finding_id: findingIds[1] || null,
      category: 'COST_DRIFT',
      severity: 'MEDIUM',
      status: 'ACKNOWLEDGED',
      fingerprint: 'alert_drift_doc_1',
    }
  ]);
  if (alErr) { console.error('❌ Failed to insert alerts:', alErr); process.exit(1); }
  console.log('✅ Inserted alerts');
  
  // Write DEMO_ORG_ID to .env.local (replace any existing values)
  const envPath = '.env.local';
  let envContent = fs.readFileSync(envPath, 'utf-8');
  envContent = envContent.split('\n').filter(line => !line.startsWith('DEMO_ORG_ID=')).join('\n');
  envContent = envContent.trimEnd() + `\nDEMO_ORG_ID=${orgId}\n`;
  fs.writeFileSync(envPath, envContent);
  
  console.log('\n🎉 Seed complete! Org ID:', orgId);
  console.log('✅ Updated DEMO_ORG_ID in .env.local');
  console.log('\n👉 Restart your dev server (npm run dev) for changes to take effect.');
}

seed().catch(err => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
