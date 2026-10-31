import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { MonitoringService } from '../core/monitoring/monitoring-service';
import { InMemoryPricingCatalog } from '../core/pricing';
import { ingestUsageEvents } from '../core/usage/ingestion';
import { loadPricingFixtures } from './load-pricing-fixtures';
import {
  buildDemoDataset,
  demoMonitoringConfigId,
  DEMO_DATASET_DAYS,
  DEMO_ORGANIZATION_ID,
  DEMO_SEED_KEY,
  assertDemoOwnedRows,
  getDefaultDatasetEnd,
  pricingRecordFromRow,
  resolveDemoTarget,
  runCleanupSteps
} from './demo-dataset';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const seedValue = Number(process.env.DEMO_SEED ?? '12345');
const end = process.env.DEMO_DATASET_END ? new Date(process.env.DEMO_DATASET_END) : getDefaultDatasetEnd();
const days = Number(process.env.DEMO_DATASET_DAYS ?? DEMO_DATASET_DAYS);

function requireConfiguration() {
  if (!supabaseUrl) throw new Error('NEXT_PUBLIC_SUPABASE_URL is required; refusing to seed an unidentified database.');
  if (!supabaseKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required. Set it in .env.local before seeding.');
  const target = resolveDemoTarget(
    supabaseUrl,
    process.env.DEMO_SEED_ALLOW_REMOTE === 'true',
    process.env.DEMO_SEED_EXPECTED_REMOTE_HOST
  );
  if (target === 'remote') {
    console.warn('Remote demo seeding explicitly enabled for the hostname-pinned target.');
  }
}

async function assertDemoOrganization(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from('organizations')
    .select('id, demo_seed_key')
    .eq('id', DEMO_ORGANIZATION_ID)
    .maybeSingle();
  if (error) throw new Error(`Cannot verify demo organization ownership (apply the demo ownership migration first): ${error.message}`);

  if (data) {
    if (data.demo_seed_key !== DEMO_SEED_KEY) {
      throw new Error(`Refusing cleanup: organization ${DEMO_ORGANIZATION_ID} is not marked as the StackAudit demo dataset.`);
    }
    return;
  }

  const { error: insertError } = await supabase.from('organizations').insert({
    id: DEMO_ORGANIZATION_ID,
    name: 'StackAudit Demonstration Dataset',
    demo_seed_key: DEMO_SEED_KEY
  });
  if (insertError) throw new Error(`Could not create isolated demo organization: ${insertError.message}`);
}

async function cleanupOwnedDataset(supabase: SupabaseClient) {
  const { data: organization, error: ownershipError } = await supabase
    .from('organizations')
    .select('demo_seed_key')
    .eq('id', DEMO_ORGANIZATION_ID)
    .maybeSingle();
  if (ownershipError || organization?.demo_seed_key !== DEMO_SEED_KEY) {
    throw new Error('Refusing demo cleanup because the organization ownership marker could not be verified.');
  }

  await runCleanupSteps([
    () => supabase.from('usage_events').delete().eq('organization_id', DEMO_ORGANIZATION_ID),
    () => supabase.from('outcome_events').delete().eq('organization_id', DEMO_ORGANIZATION_ID),
    () => supabase.from('alerts').delete().eq('organization_id', DEMO_ORGANIZATION_ID),
    () => supabase.from('audit_findings').delete().eq('organization_id', DEMO_ORGANIZATION_ID),
    () => supabase.from('monitoring_runs').delete().eq('organization_id', DEMO_ORGANIZATION_ID),
    () => supabase.from('monitoring_configs').delete().eq('organization_id', DEMO_ORGANIZATION_ID),
    () => supabase.from('attribution_rules').delete().eq('organization_id', DEMO_ORGANIZATION_ID),
    () => supabase.from('workloads').delete().eq('organization_id', DEMO_ORGANIZATION_ID)
  ]);
}

async function upsertInBatches<T extends object>(
  supabase: SupabaseClient,
  table: string,
  rows: T[],
  conflict: string,
  batchSize = 100
) {
  for (let index = 0; index < rows.length; index += batchSize) {
    const { error } = await supabase.from(table).upsert(rows.slice(index, index + batchSize) as never[], { onConflict: conflict });
    if (error) throw new Error(`Failed seeding ${table} batch ${Math.floor(index / batchSize) + 1}: ${error.message}`);
  }
}

export async function seedDemoData() {
  requireConfiguration();
  const supabase = createClient(supabaseUrl!, supabaseKey!);
  const { data: initialPricing, error: pricingError } = await supabase
    .from('pricing_catalog')
    .select('id, provider, model, input_price, output_price, cache_read_price, cache_creation_price, effective_from, effective_until, source')
    .in('provider', ['openai', 'anthropic']);
  if (pricingError) throw new Error(`Could not load the existing pricing catalog: ${pricingError.message}`);

  let pricingRows = initialPricing;

  if (!pricingRows || pricingRows.length === 0) {
    console.log('Pricing catalog is empty. Automatically loading reviewed reference pricing fixtures...');
    await loadPricingFixtures(supabase);
    const reload = await supabase
      .from('pricing_catalog')
      .select('id, provider, model, input_price, output_price, cache_read_price, cache_creation_price, effective_from, effective_until, source')
      .in('provider', ['openai', 'anthropic']);
    if (reload.error) throw new Error(`Could not reload pricing catalog after loading fixtures: ${reload.error.message}`);
    pricingRows = reload.data;
  }

  const pricingRecords = (pricingRows || []).map(row => pricingRecordFromRow(row));
  if (!pricingRecords.length) throw new Error('The pricing catalog has no OpenAI or Anthropic records; add catalog records before seeding.');

  const dataset = await buildDemoDataset({ seed: seedValue, end, days }, pricingRecords);
  const pricingCatalog = new InMemoryPricingCatalog(pricingRecords);

  await assertDemoOrganization(supabase);
  const [{ data: existingWorkloads, error: workloadCheckError }, { data: existingRules, error: ruleCheckError }] = await Promise.all([
    supabase.from('workloads').select('id, organization_id').in('id', dataset.workloads.map(workload => workload.id)),
    supabase.from('attribution_rules').select('id, organization_id').in('id', dataset.attributionRules.map(rule => rule.id))
  ]);
  if (workloadCheckError || ruleCheckError) throw new Error('Could not verify demo record ownership before cleanup.');
  assertDemoOwnedRows(existingWorkloads || [], 'workload');
  assertDemoOwnedRows(existingRules || [], 'attribution rule');

  let writingStarted = false;
  try {
    // Every cleanup query is scoped to an organization with the explicit demo ownership marker.
    // Supabase REST calls do not share a transaction; on a later write failure we clean this
    // dedicated dataset back to empty and stop, rather than leave a partial demo behind.
    await cleanupOwnedDataset(supabase);
    writingStarted = true;

    const { error: workloadError } = await supabase.from('workloads').insert(dataset.workloads);
    if (workloadError) throw new Error(`Could not create demo workloads: ${workloadError.message}`);
    const { error: ruleError } = await supabase.from('attribution_rules').insert(dataset.attributionRules);
    if (ruleError) throw new Error(`Could not create demo attribution rules: ${ruleError.message}`);

    const chunkSize = 100;
    for (let index = 0; index < dataset.usageEvents.length; index += chunkSize) {
      const result = await ingestUsageEvents(dataset.usageEvents.slice(index, index + chunkSize), DEMO_ORGANIZATION_ID, pricingCatalog, supabase);
      if (result.errors.length || result.pricingFailed > 0 || result.successful !== Math.min(chunkSize, dataset.usageEvents.length - index)) {
        const reason = result.errors.map(error => error.message).join('; ') || `${result.pricingFailed} generated events have no applicable price`;
        throw new Error(`Usage ingestion did not fully price and persist the demo batch: ${reason}`);
      }
    }
    await upsertInBatches(supabase, 'outcome_events', dataset.outcomeEvents, 'organization_id,idempotency_key');

    const monitoringConfigs = dataset.workloads.map(workload => ({
      id: demoMonitoringConfigId(workload.id),
      organization_id: DEMO_ORGANIZATION_ID,
      workload_id: workload.id,
      enabled: true,
      config: { evaluationWindowDays: 14, notificationChannels: [], alertPolicy: { minSeverityToNotify: 'LOW' } }
    }));
    const { error: configError } = await supabase.from('monitoring_configs').upsert(monitoringConfigs, { onConflict: 'organization_id,workload_id' });
    if (configError) throw new Error(`Could not create monitoring configurations: ${configError.message}`);

    console.log(`Seeded ${dataset.usageEvents.length} priced usage events and ${dataset.outcomeEvents.length} outcomes.`);
    console.log(`Dataset window: [${dataset.start.toISOString()}, ${dataset.end.toISOString()}); seed ${seedValue}.`);
    console.log(`Demo organization: ${DEMO_ORGANIZATION_ID}. Set DEMO_ORG_ID to this value in .env.local for the local development fallback.`);
    console.log('Running the existing audit and monitoring pipeline...');
    const runId = await new MonitoringService(supabase).runMonitoring(DEMO_ORGANIZATION_ID);
    const { data: run, error: runError } = await supabase.from('monitoring_runs').select('status, findings_count, alerts_count').eq('id', runId).single();
    if (runError) throw new Error(`Could not read the monitoring run result: ${runError.message}`);
    if (!run || !['COMPLETED', 'COMPLETED_WITH_ERRORS'].includes(run.status)) throw new Error(`Monitoring run did not complete successfully (${run?.status || 'missing result'}).`);
    console.log(`Monitoring completed: ${run.findings_count} findings, ${run.alerts_count} alerts (derived by the application engines).`);
  } catch (error) {
    if (writingStarted) {
      try {
        await cleanupOwnedDataset(supabase);
      } catch (cleanupError) {
        throw new Error(`${error instanceof Error ? error.message : String(error)}; rollback cleanup also failed: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`);
      }
    }
    throw error;
  }
}

if (require.main === module) {
  seedDemoData().catch(error => {
    console.error(`Demo seed failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
