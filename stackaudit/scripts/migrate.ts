import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';

export function listMigrations(): string[] {
  const migrationsDir = path.resolve(__dirname, '../supabase/migrations');
  if (!fs.existsSync(migrationsDir)) {
    throw new Error(`Migrations directory not found at ${migrationsDir}`);
  }
  return fs
    .readdirSync(migrationsDir)
    .filter(file => file.endsWith('.sql'))
    .sort();
}

export function runMigrations(): void {
  console.log('=== StackAudit Database Migrations ===\n');

  const mode = process.env.STACKAUDIT_DATABASE_MODE;
  if (mode !== 'local' && mode !== 'remote') {
    throw new Error('Set STACKAUDIT_DATABASE_MODE=local for local migrations, or explicitly set remote before targeting a remote database.');
  }

  const files = listMigrations();
  console.log(`Found ${files.length} migration files in supabase/migrations:\n`);
  for (const file of files) {
    console.log(`  • ${file}`);
  }
  console.log('');

  // Check if DATABASE_URL or POSTGRES_URL is provided for direct psql application
  const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (dbUrl) {
    const host = new URL(dbUrl).hostname;
    const isLocal = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(host);
    if (mode === 'local' && !isLocal) throw new Error('Local mode refuses a remote DATABASE_URL. Explicitly set STACKAUDIT_DATABASE_MODE=remote to proceed.');
    if (mode === 'remote' && isLocal) throw new Error('Remote mode requires a non-local DATABASE_URL.');
    console.log('Applying migrations to DATABASE_URL via psql...');
    const migrationsDir = path.resolve(__dirname, '../supabase/migrations');
    for (const file of files) {
      const fullPath = path.join(migrationsDir, file);
      console.log(`Applying ${file}...`);
      execSync(`psql "${dbUrl}" -f "${fullPath}"`, { stdio: 'inherit' });
    }
    console.log('\n✓ All migrations applied successfully.');
    return;
  }

  // Supabase CLI can target a linked remote project; require explicit remote mode.
  if (mode !== 'remote') {
    console.log('No DATABASE_URL provided. For local Supabase, apply migrations with: supabase db reset');
    return;
  }

  // Check if supabase CLI is available (remote use was explicitly selected above).
  try {
    execSync('supabase --version', { stdio: 'ignore' });
    console.log('Applying migrations via Supabase CLI (supabase db push)...');
    execSync('supabase db push', { stdio: 'inherit' });
    console.log('\n✓ Migrations applied successfully via Supabase CLI.');
    return;
  } catch {
    // Supabase CLI not directly in PATH
  }

  console.log('To apply migrations with Supabase CLI:');
  console.log('  supabase db reset');
  console.log('');
  console.log('Or set DATABASE_URL in .env.local to apply via direct PostgreSQL connection:');
  console.log('  DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres');
  console.log('  npm run db:migrate\n');
}

if (require.main === module) {
  try {
    runMigrations();
  } catch (err) {
    console.error(`Migration failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  }
}
