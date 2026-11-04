import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import Big from 'big.js';

export interface PricingFixtureRecord {
  [key: string]: unknown;
  id: string;
  provider: string;
  model: string;
  input_price: string;
  output_price: string;
  cache_read_price?: string | null;
  cache_creation_price?: string | null;
  effective_from: string;
  effective_until?: string | null;
  source: string;
  description?: string;
}

export interface PricingFixtureFile {
  version: string;
  name: string;
  description: string;
  generatedAt: string;
  records: PricingFixtureRecord[];
}

export interface LoadPricingResult {
  total: number;
  inserted: number;
  updated: number;
  skipped: number;
}

export function validatePricingRecord(record: PricingFixtureRecord): void {
  if (!record.id || !record.provider || !record.model || !record.source) {
    throw new Error(`Invalid fixture record: id, provider, model, and source are required.`);
  }

  const inputPrice = new Big(record.input_price);
  const outputPrice = new Big(record.output_price);
  if (inputPrice.lt(0) || outputPrice.lt(0)) {
    throw new Error(`Invalid price for ${record.provider}/${record.model}: prices cannot be negative.`);
  }

  if (record.cache_read_price != null) {
    const cacheReadPrice = new Big(record.cache_read_price);
    if (cacheReadPrice.lt(0)) {
      throw new Error(`Invalid cache read price for ${record.provider}/${record.model}: cannot be negative.`);
    }
  }

  if (record.cache_creation_price != null) {
    const cacheCreationPrice = new Big(record.cache_creation_price);
    if (cacheCreationPrice.lt(0)) {
      throw new Error(`Invalid cache creation price for ${record.provider}/${record.model}: cannot be negative.`);
    }
  }

  const from = new Date(record.effective_from);
  if (isNaN(from.getTime())) {
    throw new Error(`Invalid effective_from date for ${record.provider}/${record.model}: ${record.effective_from}`);
  }

  if (record.effective_until) {
    const until = new Date(record.effective_until);
    if (isNaN(until.getTime()) || until <= from) {
      throw new Error(`Invalid effective_until date for ${record.provider}/${record.model}: must be after effective_from.`);
    }
  }
}

export function readDefaultFixtureFile(): PricingFixtureFile {
  const filePath = path.resolve(__dirname, '../fixtures/pricing/reference-pricing-v1.json');
  if (!fs.existsSync(filePath)) {
    throw new Error(`Pricing fixture file not found at ${filePath}`);
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(content) as PricingFixtureFile;
}

export async function loadPricingFixtures(
  supabase: SupabaseClient,
  fixtureData?: PricingFixtureRecord[]
): Promise<LoadPricingResult> {
  const records = fixtureData ?? readDefaultFixtureFile().records;

  for (const record of records) {
    validatePricingRecord(record);
  }

  // Fetch existing pricing rows to check uniqueness & preserve manually maintained rows
  const { data: existingRows, error: fetchError } = await supabase
    .from('pricing_catalog')
    .select('id, provider, model, effective_from, source');

  if (fetchError) {
    throw new Error(`Failed to query existing pricing catalog: ${fetchError.message}`);
  }

  const result: LoadPricingResult = {
    total: records.length,
    inserted: 0,
    updated: 0,
    skipped: 0
  };

  for (const fixture of records) {
    const fixtureFromIso = new Date(fixture.effective_from).toISOString();

    const existing = (existingRows || []).find(row =>
      row.provider === fixture.provider &&
      row.model === fixture.model &&
      new Date(row.effective_from).toISOString() === fixtureFromIso
    );

    if (existing) {
      // Check if existing record is a fixture/sample reference
      const isFixture =
        existing.source.startsWith('sample-reference:') ||
        existing.source.startsWith('fixture:') ||
        existing.source === fixture.source;

      if (!isFixture) {
        // Manually maintained production record - DO NOT OVERWRITE
        result.skipped++;
        console.log(
          `  [PRESERVED] ${fixture.provider}/${fixture.model} (effective ${fixture.effective_from}): ` +
          `existing manual source "${existing.source}" preserved.`
        );
        continue;
      }

      // Update existing fixture record
      const { error: updateError } = await supabase
        .from('pricing_catalog')
        .update({
          input_price: fixture.input_price,
          output_price: fixture.output_price,
          cache_read_price: fixture.cache_read_price ?? null,
          cache_creation_price: fixture.cache_creation_price ?? null,
          effective_until: fixture.effective_until ? new Date(fixture.effective_until).toISOString() : null,
          source: fixture.source
        })
        .eq('id', existing.id);

      if (updateError) {
        throw new Error(`Failed to update fixture for ${fixture.provider}/${fixture.model}: ${updateError.message}`);
      }
      result.updated++;
    } else {
      // Insert new fixture record
      const { error: insertError } = await supabase
        .from('pricing_catalog')
        .insert({
          id: fixture.id,
          provider: fixture.provider,
          model: fixture.model,
          input_price: fixture.input_price,
          output_price: fixture.output_price,
          cache_read_price: fixture.cache_read_price ?? null,
          cache_creation_price: fixture.cache_creation_price ?? null,
          effective_from: new Date(fixture.effective_from).toISOString(),
          effective_until: fixture.effective_until ? new Date(fixture.effective_until).toISOString() : null,
          source: fixture.source
        });

      if (insertError) {
        throw new Error(`Failed to insert fixture for ${fixture.provider}/${fixture.model}: ${insertError.message}`);
      }
      result.inserted++;
    }
  }

  return result;
}

async function runCli() {
  if (process.env.STACKAUDIT_DATABASE_MODE !== 'local') throw new Error('Pricing fixture loading requires STACKAUDIT_DATABASE_MODE=local.');
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) throw new Error('NEXT_PUBLIC_SUPABASE_URL is required in .env.local');
  if (!supabaseKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required in .env.local');
  const host = new URL(supabaseUrl).hostname;
  if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(host)) throw new Error('Pricing fixture loading requires a localhost Supabase URL.');

  console.log('Loading reviewed reference pricing fixtures...');
  const supabase = createClient(supabaseUrl, supabaseKey);
  const result = await loadPricingFixtures(supabase);

  console.log(
    `Pricing fixtures processed: ${result.total} total ` +
    `(${result.inserted} inserted, ${result.updated} updated, ${result.skipped} manual records preserved).`
  );
}

if (require.main === module) {
  runCli().catch(err => {
    console.error(`Failed to load pricing fixtures: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  });
}
