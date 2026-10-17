import { createClient } from '@supabase/supabase-js';
import * as crypto from 'crypto';
import * as fs from 'fs';
import { MonitoringService } from '../core/monitoring/monitoring-service';
import { calculateCost } from '../core/pricing/calculator';
import { CanonicalUsageEvent, PricingRecord } from '../core/types';

function mulberry32(a: number) {
  return function() {
    let t = a += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
}

const rng = mulberry32(12345);

// PRNG helpers
function randRange(min: number, max: number) {
  return min + rng() * (max - min);
}
function randInt(min: number, max: number) {
  return Math.floor(randRange(min, max));
}

// Fixed UUIDs for reproducibility
function fakeUUID(seedNum: number) {
  const hex = seedNum.toString(16).padStart(12, '0');
  return `00000000-0000-4000-8000-${hex}`;
}

const PRICING: Record<string, Record<string, { input: string; output: string }>> = {
  'openai': {
    'gpt-4o-mini': { input: '0.15', output: '0.60' },
    'gpt-4o': { input: '5.00', output: '15.00' }
  },
  'anthropic': {
    'claude-3-haiku-20240307': { input: '0.25', output: '1.25' },
    'claude-3-sonnet-20240229': { input: '3.00', output: '15.00' }
  }
} as const;

function getCost(provider: string, model: string, inputTokens: number, outputTokens: number) {
  const rates = PRICING[provider]?.[model];
  if (!rates) throw new Error(`No demo pricing configured for ${provider}/${model}`);
  const pricing: PricingRecord = {
    id: `demo-${provider}-${model}`,
    provider,
    model,
    inputPrice: rates.input,
    outputPrice: rates.output,
    effectiveFrom: new Date('2000-01-01T00:00:00.000Z'),
    source: 'Simulated demo pricing; not a provider quote'
  };
  const event: CanonicalUsageEvent = {
    id: 'demo-calculation',
    provider,
    model,
    timestamp: new Date(),
    usage: { inputTokens, outputTokens },
    attribution: {},
    providerReference: 'demo-calculation',
    rawResponseHash: 'demo-calculation'
  };
  return calculateCost(event, pricing).totalCost;
}

function getSeasonalMultiplier(dayOffset: number, dayOfWeek: number) {
  // Weekly seasonality (Sunday=0 ... Saturday=6)
  const weekly = [0.8, 1.15, 1.1, 1.0, 1.05, 0.95, 0.8];
  // 90 days ago = 1.0x, today = 1.4x (steady linear growth)
  const growth = 1.0 + ((90 - dayOffset) / 90) * 0.4;
  return weekly[dayOfWeek] * growth;
}

async function seed() {
  const envContent = fs.readFileSync('.env.local', 'utf-8');
  const env: Record<string, string> = {};
  envContent.split('\n').forEach(line => {
    const [k, ...v] = line.split('=');
    if (k && v.length) env[k.trim()] = v.join('=').trim();
  });

  const supabaseUrl = env['NEXT_PUBLIC_SUPABASE_URL'] || 'http://localhost:54321';
  const supabaseKey = env['SUPABASE_SERVICE_ROLE_KEY'];
  if (!supabaseKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required. Set it in .env.local before seeding.');
  }
  const supabaseHostname = new URL(supabaseUrl).hostname;
  const isLocalSupabase = ['127.0.0.1', 'localhost', '[::1]'].includes(supabaseHostname);
  if (!isLocalSupabase && env['DEMO_SEED_ALLOW_REMOTE'] !== 'true') {
    throw new Error('Refusing to seed a remote database. Set DEMO_SEED_ALLOW_REMOTE=true only when this is intentional.');
  }
  const supabase = createClient(supabaseUrl, supabaseKey);

  console.log('Seeding Realistic Demo Data for Phase 10 Dashboard...');
  console.log('Supabase URL:', supabaseUrl);

  const orgId = fakeUUID(1);
  const { error: orgErr } = await supabase.from('organizations').insert({ id: orgId, name: 'Demo Corp (Realistic)' });
  if (orgErr && orgErr.code !== '23505') { console.error('❌ Organization:', orgErr); return; }
  console.log('✅ Created Organization:', orgId);

  // Workloads
  const wSupport = fakeUUID(2);
  const wDoc = fakeUUID(3);
  const wSales = fakeUUID(4);
  const workloads = [
    { id: wSupport, organization_id: orgId, name: 'Support Triage', description: 'Automated ticket routing' },
    { id: wDoc, organization_id: orgId, name: 'Document Summarization', description: 'Internal wiki summarization' },
    { id: wSales, organization_id: orgId, name: 'Sales Research', description: 'Lead qualification insights' }
  ];
  await supabase.from('workloads').upsert(workloads, { onConflict: 'id' });
  console.log('✅ Created 3 Workloads');

  // Attribution Rules
  const supportKey = fakeUUID(10);
  const docKey = fakeUUID(11);
  const salesKey = fakeUUID(12);
  await supabase.from('attribution_rules').upsert([
    { id: fakeUUID(20), organization_id: orgId, workload_id: wSupport, match_type: 'API_KEY', match_value: supportKey, provider: 'openai' },
    { id: fakeUUID(21), organization_id: orgId, workload_id: wDoc, match_type: 'API_KEY', match_value: docKey, provider: 'anthropic' },
    { id: fakeUUID(22), organization_id: orgId, workload_id: wSales, match_type: 'API_KEY', match_value: salesKey, provider: 'anthropic' }
  ], { onConflict: 'id' });
  
  // Clean up old data for this org to prevent buildup
  const demoWorkloadIds = [wSupport, wDoc, wSales];
  const cleanupResults = await Promise.all([
    supabase.from('usage_events').delete().eq('organization_id', orgId),
    supabase.from('outcome_events').delete().in('workload_id', demoWorkloadIds),
    supabase.from('alerts').delete().eq('organization_id', orgId),
    supabase.from('audit_findings').delete().eq('organization_id', orgId),
    supabase.from('monitoring_configs').delete().eq('organization_id', orgId)
  ]);
  const cleanupError = cleanupResults.find(result => result.error)?.error;
  if (cleanupError) throw new Error(`Could not clear prior demo dataset: ${cleanupError.message}`);

  const usageEvents = [];
  const outcomeEvents = [];

  const now = new Date();
  
  // Start from Day 90 down to Day 1
  for (let offset = 90; offset >= 0; offset--) {
    const d = new Date(now.getTime() - offset * 86400000);
    const dayOfWeek = d.getDay();
    const seasonMult = getSeasonalMultiplier(offset, dayOfWeek);

    // ==========================================
    // Workload A: Support Triage 
    // Scenario: Normal traffic -> traffic spikes around day 15 ago, tokens/req surge, shifting model mix
    // ==========================================
    let supportReqs = Math.round(1200 * seasonMult);
    let supportInputPerReq = 4500;
    let supportOutputPerReq = 800;
    let gpt4oRatio = 0.05; // 5% baseline

    // Anomaly logic! Day offset goes down to 0 (today)
    // The monitoring window evaluates the last 14 days vs the prior 14 days.
    // The spike must be strong enough to trigger COST_DRIFT (>30%).
    if (offset <= 14 && offset >= 2) {
       // Traffic spike!
       supportReqs = Math.round(1800 * seasonMult);
       // Token surge
       supportInputPerReq = 8500;
       // Model shift
       gpt4oRatio = 0.50; // 50% fall back to gpt-4o because prompts got complex
    } else if (offset < 2) {
       // Start returning to normal
       supportReqs = Math.round(1300 * seasonMult);
       supportInputPerReq = 5000;
       gpt4oRatio = 0.15;
    }

    // Add noise
    supportReqs += randInt(-50, 50);
    supportInputPerReq += randInt(-200, 200);
    supportOutputPerReq += randInt(-50, 50);

    const supportReqs4o = Math.round(supportReqs * gpt4oRatio);
    const supportReqsMini = supportReqs - supportReqs4o;

    // Create a batch row for Mini
    const miniCost = getCost('openai', 'gpt-4o-mini', supportReqsMini * supportInputPerReq, supportReqsMini * supportOutputPerReq);
    usageEvents.push({
      id: crypto.randomUUID(),
      organization_id: orgId,
      api_key_id: supportKey,
      provider: 'openai',
      model: 'gpt-4o-mini',
      timestamp: d.toISOString(),
      input_tokens: supportReqsMini * supportInputPerReq,
      output_tokens: supportReqsMini * supportOutputPerReq,
      cache_read_tokens: 0,
      cache_creation_tokens: 0,
      calculated_cost: miniCost,
      request_count: supportReqsMini,
      provider_reference: crypto.randomUUID(),
      raw_response_hash: crypto.randomUUID(),
    });

    // Create a batch row for 4o
    if (supportReqs4o > 0) {
      const o4Cost = getCost('openai', 'gpt-4o', supportReqs4o * supportInputPerReq, supportReqs4o * supportOutputPerReq);
      usageEvents.push({
        id: crypto.randomUUID(),
        organization_id: orgId,
        api_key_id: supportKey,
        provider: 'openai',
        model: 'gpt-4o',
        timestamp: d.toISOString(),
        input_tokens: supportReqs4o * supportInputPerReq,
        output_tokens: supportReqs4o * supportOutputPerReq,
        cache_read_tokens: 0,
        cache_creation_tokens: 0,
        calculated_cost: o4Cost,
        request_count: supportReqs4o,
        provider_reference: crypto.randomUUID(),
        raw_response_hash: crypto.randomUUID()
      });
    }

    // Outcomes: Probability of ticket resolved falls during spike (complex issues)
    const resolveRate = offset <= 14 && offset >= 2 ? 0.65 : 0.85;
    const resolvedCount = Math.round(supportReqs * resolveRate) + randInt(-20, 20);
    outcomeEvents.push({
      id: crypto.randomUUID(),
      workload_id: wSupport,
      outcome_type: 'ticket_resolved',
      timestamp: d.toISOString(),
      count: resolvedCount
    });

    // ==========================================
    // Workload B: Document Summarization (Healthy)
    // ==========================================
    const docReqs = Math.round(200 * seasonMult) + randInt(-15, 15);
    const docInputPerReq = 5000 + randInt(-1000, 1000);
    const docOutputPerReq = 800 + randInt(-200, 200);

    const docCost = getCost('anthropic', 'claude-3-haiku-20240307', docReqs * docInputPerReq, docReqs * docOutputPerReq);
    usageEvents.push({
      id: crypto.randomUUID(),
      organization_id: orgId,
      api_key_id: docKey,
      provider: 'anthropic',
      model: 'claude-3-haiku-20240307',
      timestamp: d.toISOString(),
      input_tokens: docReqs * docInputPerReq,
      output_tokens: docReqs * docOutputPerReq,
      cache_read_tokens: 0,
      cache_creation_tokens: 0,
      calculated_cost: docCost,
      request_count: docReqs,
      provider_reference: crypto.randomUUID(),
      raw_response_hash: crypto.randomUUID(),
    });
    outcomeEvents.push({
      id: crypto.randomUUID(),
      workload_id: wDoc,
      outcome_type: 'document_processed',
      timestamp: d.toISOString(),
      count: docReqs // 100% success rate
    });

    // ==========================================
    // Workload C: Sales Research (Variable, Spiky)
    // ==========================================
    const salesMult = randRange(0.6, 1.5);
    const salesReqs = Math.round(150 * seasonMult * salesMult);
    const salesInputPerReq = 12000 + randInt(-3000, 3000);
    const salesOutputPerReq = 1500 + randInt(-500, 500);

    const salesCost = getCost('anthropic', 'claude-3-sonnet-20240229', salesReqs * salesInputPerReq, salesReqs * salesOutputPerReq);
    usageEvents.push({
      id: crypto.randomUUID(),
      organization_id: orgId,
      api_key_id: salesKey,
      provider: 'anthropic',
      model: 'claude-3-sonnet-20240229',
      timestamp: d.toISOString(),
      input_tokens: salesReqs * salesInputPerReq,
      output_tokens: salesReqs * salesOutputPerReq,
      cache_read_tokens: 0,
      cache_creation_tokens: 0,
      calculated_cost: salesCost,
      request_count: salesReqs,
      provider_reference: crypto.randomUUID(),
      raw_response_hash: crypto.randomUUID(),
    });
    
    // Outcomes: Variable completion
    const researchCount = Math.round(salesReqs * randRange(0.5, 0.8));
    outcomeEvents.push({
      id: crypto.randomUUID(),
      workload_id: wSales,
      outcome_type: 'research_completed',
      timestamp: d.toISOString(),
      count: researchCount
    });
  }

  // Insert batches
  console.log(`Inserting ${usageEvents.length} Usage Events...`);
  const chunkSize = 100;
  for(let i=0; i<usageEvents.length; i+=chunkSize) {
     const { error } = await supabase.from('usage_events').insert(usageEvents.slice(i, i+chunkSize));
     if (error) console.error('Error inserting usage_events:', error);
  }
  
  console.log(`Inserting ${outcomeEvents.length} Outcome Events...`);
  for(let i=0; i<outcomeEvents.length; i+=chunkSize) {
     const { error } = await supabase.from('outcome_events').insert(outcomeEvents.slice(i, i+chunkSize));
     if (error) console.error('Error inserting outcome_events:', error);
  }

  // Monitoring Configs for all workloads
  const monitoringConfigs = workloads.map(w => ({
    id: crypto.randomUUID(),
    organization_id: orgId,
    workload_id: w.id,
    enabled: true,
    config: {
      evaluationWindowDays: 14,
      notificationChannels: [],
      alertPolicy: { minSeverityToNotify: 'LOW' }
    }
  }));
  await supabase.from('monitoring_configs').insert(monitoringConfigs);

  console.log('Running Audit/Monitoring Engine...');
  const monitoringService = new MonitoringService(supabase);
  const runId = await monitoringService.runMonitoring(orgId);
  
  const { data: mrun } = await supabase.from('monitoring_runs').select('*').eq('id', runId).single();
  console.log('✅ Monitoring Run Complete:', mrun);

  console.log(`\n🎉 Dataset complete. Demo organization ID: ${orgId}`);
  console.log('Set DEMO_ORG_ID to this value in .env.local to use the local development fallback.');
}

seed().catch(console.error);
