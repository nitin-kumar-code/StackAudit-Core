import { createHash } from 'node:crypto';
import { InMemoryPricingCatalog, PricingNotFoundError } from '../core/pricing';
import { CanonicalUsageEvent, PricingRecord } from '../core/types';

export const DEMO_ORGANIZATION_ID = process.env.DEMO_ORG_ID || '8a775c7f-e31c-8f9b-9000-000000000001';
export const DEMO_SEED_KEY = 'stackaudit-demo-v1';
export const DEMO_DATASET_DAYS = 90;
export const DEMO_DATASET_END = '2026-10-17T00:00:00.000Z';

export function getDefaultDatasetEnd(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
}

export const DEMO_WORKLOADS = [
  { id: '8a775c7f-e31c-8f9b-9000-000000000002', name: 'Support Triage', description: 'Automated ticket routing' },
  { id: '8a775c7f-e31c-8f9b-9000-000000000003', name: 'Document Summarization', description: 'Internal wiki summarization' },
  { id: '8a775c7f-e31c-8f9b-9000-000000000004', name: 'Sales Research', description: 'Lead qualification insights' }
] as const;

const NAMESPACE = 'stackaudit-demo-v1';
const DAY_MS = 24 * 60 * 60 * 1000;

export interface DemoOutcomeEvent {
  id: string;
  organization_id: string;
  workload_id: string;
  outcome_type: string;
  timestamp: string;
  count: number;
  idempotency_key: string;
  metadata: Record<string, string | number>;
}

export interface DemoDataset {
  start: Date;
  end: Date;
  workloads: Array<{ id: string; organization_id: string; name: string; description: string }>;
  attributionRules: Array<{ id: string; organization_id: string; workload_id: string; provider: string; match_type: string; match_value: string }>;
  usageEvents: CanonicalUsageEvent[];
  outcomeEvents: DemoOutcomeEvent[];
}

export interface DemoDatasetOptions {
  seed: number;
  end: Date;
  days?: number;
}

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    let t = state += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function stableUuid(name: string): string {
  const bytes = createHash('sha256').update(`${NAMESPACE}:${name}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x80;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function demoMonitoringConfigId(workloadId: string) {
  return stableUuid(`monitoring-config:${workloadId}`);
}

function int(random: () => number, min: number, max: number) {
  return Math.floor(min + random() * (max - min + 1));
}

function seasonalMultiplier(dayIndex: number, days: number, dayOfWeek: number) {
  const weekly = [0.8, 1.15, 1.1, 1.0, 1.05, 0.95, 0.8];
  const growth = 1 + (dayIndex / Math.max(days - 1, 1)) * 0.4;
  return weekly[dayOfWeek] * growth;
}

async function pickPricedModel(
  provider: string,
  preferred: string[],
  timestamp: Date,
  records: PricingRecord[],
  catalog: InMemoryPricingCatalog
) {
  const candidates = [...new Set([
    ...preferred,
    ...records.filter(record => record.provider === provider).map(record => record.model).sort()
  ])];
  for (const model of candidates) {
    try {
      await catalog.findEffectivePrice(provider, model, timestamp);
      return model;
    } catch (error) {
      if (!(error instanceof PricingNotFoundError)) throw error;
    }
  }
  throw new Error(`No applicable pricing_catalog record for supported provider ${provider} at ${timestamp.toISOString()}`);
}

function makeUsageEvent(
  key: string,
  provider: string,
  model: string,
  timestamp: Date,
  inputTokens: number,
  outputTokens: number,
  requestCount: number,
  apiKeyId: string
): CanonicalUsageEvent {
  const identity = stableUuid(key);
  const eventTimestamp = timestamp.toISOString();
  const rawResponseHash = createHash('sha256').update(`${identity}:${provider}:${model}:${inputTokens}:${outputTokens}:${requestCount}`).digest('hex');
  return {
    id: identity,
    provider,
    model,
    timestamp,
    usage: { inputTokens, outputTokens, cacheReadTokens: 0, cacheCreationTokens: 0, requestCount },
    attribution: { apiKeyId },
    providerReference: `demo-v1:${identity}`,
    rawResponseHash,
    capturedAt: new Date(eventTimestamp)
  };
}

export async function buildDemoDataset(
  options: DemoDatasetOptions,
  pricingRecords: PricingRecord[]
): Promise<DemoDataset> {
  if (!Number.isInteger(options.seed) || options.seed < 0) throw new Error('DEMO_SEED must be a non-negative integer.');
  const days = options.days ?? DEMO_DATASET_DAYS;
  if (!Number.isInteger(days) || days < 28 || days > 366) throw new Error('Demo dataset days must be between 28 and 366.');
  if (!Number.isFinite(options.end.getTime())) throw new Error('DEMO_DATASET_END must be a valid timestamp.');

  const end = new Date(options.end);
  const start = new Date(end.getTime() - days * DAY_MS);
  const random = seededRandom(options.seed);
  const catalog = new InMemoryPricingCatalog(pricingRecords);
  const supportKey = stableUuid('api-key:support');
  const docsKey = stableUuid('api-key:docs');
  const salesKey = stableUuid('api-key:sales');
  const attributionRules = [
    { id: stableUuid('rule:support'), organization_id: DEMO_ORGANIZATION_ID, workload_id: DEMO_WORKLOADS[0].id, provider: 'openai', match_type: 'api_key', match_value: supportKey },
    { id: stableUuid('rule:docs'), organization_id: DEMO_ORGANIZATION_ID, workload_id: DEMO_WORKLOADS[1].id, provider: 'anthropic', match_type: 'api_key', match_value: docsKey },
    { id: stableUuid('rule:sales'), organization_id: DEMO_ORGANIZATION_ID, workload_id: DEMO_WORKLOADS[2].id, provider: 'anthropic', match_type: 'api_key', match_value: salesKey }
  ];
  const usageEvents: CanonicalUsageEvent[] = [];
  const outcomeEvents: DemoOutcomeEvent[] = [];

  for (let dayIndex = 0; dayIndex < days; dayIndex++) {
    const timestamp = new Date(start.getTime() + dayIndex * DAY_MS);
    const multiplier = seasonalMultiplier(dayIndex, days, timestamp.getUTCDay());
    const isSpike = dayIndex >= days - 15 && dayIndex <= days - 3;
    const isRecovery = dayIndex > days - 3;

    // Support: ordinary traffic, a repeatable 13-day cost/mix spike, then recovery.
    const supportRequests = Math.round((isSpike ? 1800 : isRecovery ? 1300 : 1200) * multiplier) + int(random, -50, 50);
    const supportInput = (isSpike ? 8500 : isRecovery ? 5000 : 4500) + int(random, -200, 200);
    const supportOutput = 800 + int(random, -50, 50);
    const premiumRatio = isSpike ? 0.5 : isRecovery ? 0.15 : 0.05;
    const lowModel = await pickPricedModel('openai', ['gpt-4o-mini', 'gpt-4o'], timestamp, pricingRecords, catalog);
    const premiumModel = await pickPricedModel('openai', ['gpt-4o', 'gpt-4o-mini'], timestamp, pricingRecords, catalog);
    if (lowModel === premiumModel) {
      usageEvents.push(makeUsageEvent(`usage:support:${dayIndex}:${lowModel}`, 'openai', lowModel, timestamp,
        supportRequests * supportInput, supportRequests * supportOutput, supportRequests, supportKey));
    } else {
      const premiumRequests = Math.round(supportRequests * premiumRatio);
      const standardRequests = supportRequests - premiumRequests;
      usageEvents.push(makeUsageEvent(`usage:support:${dayIndex}:${lowModel}`, 'openai', lowModel, timestamp,
        standardRequests * supportInput, standardRequests * supportOutput, standardRequests, supportKey));
      usageEvents.push(makeUsageEvent(`usage:support:${dayIndex}:${premiumModel}`, 'openai', premiumModel, timestamp,
        premiumRequests * supportInput, premiumRequests * supportOutput, premiumRequests, supportKey));
    }
    const resolved = Math.max(1, Math.round(supportRequests * (isSpike ? 0.65 : 0.85)) + int(random, -20, 20));
    outcomeEvents.push(makeOutcome('support', DEMO_WORKLOADS[0].id, 'ticket_resolved', timestamp, resolved));

    // Documents: stable low-cost profile, with normal weekly and volume variation.
    const docsModel = await pickPricedModel('anthropic', ['claude-3-haiku-20240307', 'claude-3-sonnet-20240229'], timestamp, pricingRecords, catalog);
    const docsRequests = Math.max(1, Math.round(200 * multiplier) + int(random, -15, 15));
    const docsInput = 5000 + int(random, -1000, 1000);
    const docsOutput = 800 + int(random, -200, 200);
    usageEvents.push(makeUsageEvent(`usage:docs:${dayIndex}:${docsModel}`, 'anthropic', docsModel, timestamp,
      docsRequests * docsInput, docsRequests * docsOutput, docsRequests, docsKey));
    outcomeEvents.push(makeOutcome('docs', DEMO_WORKLOADS[1].id, 'document_processed', timestamp, docsRequests));

    // Sales: intentionally variable, but without a hard-coded alert or finding.
    const salesModel = await pickPricedModel('anthropic', ['claude-3-sonnet-20240229', 'claude-3-haiku-20240307'], timestamp, pricingRecords, catalog);
    const salesRequests = Math.max(1, Math.round(150 * multiplier * (0.6 + random() * 0.9)));
    const salesInput = 12000 + int(random, -3000, 3000);
    const salesOutput = 1500 + int(random, -500, 500);
    usageEvents.push(makeUsageEvent(`usage:sales:${dayIndex}:${salesModel}`, 'anthropic', salesModel, timestamp,
      salesRequests * salesInput, salesRequests * salesOutput, salesRequests, salesKey));
    const researched = Math.max(1, Math.round(salesRequests * (0.5 + random() * 0.3)));
    outcomeEvents.push(makeOutcome('sales', DEMO_WORKLOADS[2].id, 'research_completed', timestamp, researched));
  }

  return {
    start,
    end,
    workloads: DEMO_WORKLOADS.map(workload => ({ ...workload, organization_id: DEMO_ORGANIZATION_ID })),
    attributionRules,
    usageEvents,
    outcomeEvents
  };
}

function makeOutcome(key: string, workloadId: string, outcomeType: string, timestamp: Date, count: number): DemoOutcomeEvent {
  const identity = stableUuid(`outcome:${key}:${timestamp.toISOString()}`);
  return {
    id: identity,
    organization_id: DEMO_ORGANIZATION_ID,
    workload_id: workloadId,
    outcome_type: outcomeType,
    timestamp: timestamp.toISOString(),
    count,
    idempotency_key: `demo-v1:${identity}`,
    metadata: { source: 'deterministic-demo-seed' }
  };
}

export function resolveDemoTarget(
  targetUrl: string,
  allowRemote: boolean,
  expectedRemoteHost?: string
): 'local' | 'remote' {
  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
  } catch {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is missing or invalid; refusing to seed an unidentified database.');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Supabase target must use HTTP or HTTPS.');
  const host = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (['localhost', '127.0.0.1', '::1'].includes(host)) return 'local';
  if (!allowRemote) throw new Error('Refusing to seed a remote database. Remote seeding is disabled by default.');
  if (!expectedRemoteHost || expectedRemoteHost.toLowerCase() !== host) {
    throw new Error('Remote seeding requires DEMO_SEED_EXPECTED_REMOTE_HOST to exactly match the target hostname.');
  }
  return 'remote';
}

export function assertDemoOwnedRows(
  rows: Array<{ id: string; organization_id: string }>,
  entity: string
) {
  const foreign = rows.find(row => row.organization_id !== DEMO_ORGANIZATION_ID);
  if (foreign) throw new Error(`Refusing to modify ${entity} ID ${foreign.id}: it belongs to another organization.`);
}

export async function runCleanupSteps(steps: Array<() => PromiseLike<{ error: { message: string } | null }>>) {
  for (const step of steps) {
    const { error } = await step();
    if (error) throw new Error(`Demo cleanup failed: ${error.message}`);
  }
}

export function pricingRecordFromRow(row: Record<string, unknown>): PricingRecord {
  return {
    id: String(row.id),
    provider: String(row.provider),
    model: String(row.model),
    inputPrice: String(row.input_price),
    outputPrice: String(row.output_price),
    cacheReadPrice: row.cache_read_price == null ? undefined : String(row.cache_read_price),
    cacheCreationPrice: row.cache_creation_price == null ? undefined : String(row.cache_creation_price),
    effectiveFrom: new Date(String(row.effective_from)),
    effectiveUntil: row.effective_until == null ? undefined : new Date(String(row.effective_until)),
    source: String(row.source)
  };
}
