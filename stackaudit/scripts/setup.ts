import { createClient } from '@supabase/supabase-js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { loadPricingFixtures } from './load-pricing-fixtures';
import { seedDemoData } from './seed-demo-data';

function checkOrInitializeEnvFile(): boolean {
  const envLocalPath = path.resolve(__dirname, '../.env.local');
  const envExamplePath = path.resolve(__dirname, '../.env.example');

  if (!fs.existsSync(envLocalPath)) {
    if (fs.existsSync(envExamplePath)) {
      fs.copyFileSync(envExamplePath, envLocalPath);
      console.log('✓ Created .env.local from .env.example');
      return true;
    } else {
      console.error('✗ Neither .env.local nor .env.example found.');
      return false;
    }
  }
  return true;
}

export async function runSetup(): Promise<void> {
  console.log('=== StackAudit First-Run Setup ===\n');

  // 1. Ensure environment file exists
  checkOrInitializeEnvFile();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (process.env.STACKAUDIT_DATABASE_MODE !== 'local') throw new Error('First-run setup requires STACKAUDIT_DATABASE_MODE=local.');

  if (!supabaseUrl || !supabaseKey) {
    console.error('✗ Missing database credentials in .env.local.\n');
    console.log('To set up local Supabase:');
    console.log('  1. Run: supabase start');
    console.log('  2. Copy the API URL and service_role key printed by supabase status into .env.local:');
    console.log('     NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321');
    console.log('     STACKAUDIT_DATABASE_MODE=local');
    console.log('     SUPABASE_SERVICE_ROLE_KEY=<service_role key>');
    console.log('     STACKAUDIT_WORKSPACE_ORG_ID=8a775c7f-e31c-8f9b-9000-000000000001');
    console.log('  3. Run: supabase db reset');
    console.log('  4. Run: npm run setup\n');
    throw new Error('Supabase credentials not configured.');
  }
  const host = new URL(supabaseUrl).hostname;
  if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(host)) throw new Error('First-run setup requires a localhost Supabase URL.');

  const supabase = createClient(supabaseUrl, supabaseKey);

  // 2. Test database connection & migrations presence
  console.log('1. Checking database connection and schema...');
  const { error: testError } = await supabase
    .from('organizations')
    .select('id', { count: 'exact', head: true });

  if (testError) {
    if (testError.message.includes('relation "organizations" does not exist') || testError.code === '42P01') {
      console.error('\n✗ Database schema has not been initialized.');
      console.log('Please apply migrations before running setup:');
      console.log('  supabase db reset');
      console.log('Then rerun: npm run setup\n');
      throw new Error('Database migrations not applied.');
    }
    throw new Error(`Database connection failed: ${testError.message}`);
  }
  console.log('✓ Database schema verified.\n');

  // 3. Load reviewed pricing fixtures
  console.log('2. Loading reviewed reference pricing fixtures...');
  const fixtureResult = await loadPricingFixtures(supabase);
  console.log(`✓ Pricing fixtures loaded: ${fixtureResult.inserted} inserted, ${fixtureResult.updated} updated, ${fixtureResult.skipped} manual preserved.\n`);

  // 4. Seed demo dataset
  console.log('3. Seeding demonstration dataset...');
  await seedDemoData();
  console.log('✓ Demonstration data seeded successfully.\n');

  // 5. Completion banner
  console.log('====================================================');
  console.log('StackAudit local environment setup is complete!');
  console.log('====================================================');
  console.log('\nStart the local development server:');
  console.log('  npm run dev\n');
  console.log('Then open the dashboard:');
  console.log('  http://localhost:3000\n');
}

if (require.main === module) {
  runSetup().catch(err => {
    console.error(`\nSetup stopped: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  });
}
