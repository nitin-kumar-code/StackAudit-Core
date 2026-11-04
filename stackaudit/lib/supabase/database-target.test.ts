import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { validateDatabaseTarget } from './database-target';

describe('database target boundary', () => {
  it('requires an explicit local or remote decision', () => {
    expect(() => validateDatabaseTarget(undefined, 'http://127.0.0.1:54321')).toThrow('STACKAUDIT_DATABASE_MODE');
  });
  it('rejects a remote host in local mode', () => {
    expect(() => validateDatabaseTarget('local', 'https://example.supabase.co')).toThrow('requires a localhost');
  });
  it('allows a remote target only after explicit remote selection', () => {
    expect(() => validateDatabaseTarget('remote', 'https://example.supabase.co')).not.toThrow();
  });
  it('rejects a localhost target mislabeled as remote', () => {
    expect(() => validateDatabaseTarget('remote', 'http://localhost:54321')).toThrow('non-local');
  });
  it('keeps the service-role key out of browser code and exposes no anon database client', () => {
    const root = process.cwd();
    const source = readFileSync(join(root, 'lib/supabase/client.ts'), 'utf8');
    expect(source).not.toContain('NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY');
    expect(source).not.toContain('NEXT_PUBLIC_SUPABASE_ANON_KEY');
    expect(source).toContain('SUPABASE_SERVICE_ROLE_KEY');
    const files: string[] = [];
    const collect = (dir: string) => {
      for (const entry of readdirSync(join(root, dir))) {
        const relative = join(dir, entry);
        if (statSync(join(root, relative)).isDirectory()) collect(relative);
        else if (/\.(tsx?|jsx?)$/.test(entry)) files.push(relative);
      }
    };
    collect('app');
    for (const file of files) {
      const text = readFileSync(join(root, file), 'utf8');
      if (/^['"]use client['"];?/m.test(text)) {
        expect(text, `${file} must not import a privileged Supabase client`).not.toMatch(/supabase\/client|supabaseAdmin/);
      }
    }
  });
  it('denies browser table and function access by default', () => {
    const sql = readFileSync(join(process.cwd(), 'supabase/migrations/20261031000000_single_user_local_preview_boundary.sql'), 'utf8');
    expect(sql).toContain('ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('REVOKE ALL ON TABLE');
    expect(sql).toContain('REVOKE EXECUTE ON ALL FUNCTIONS');
    expect(sql).not.toMatch(/CREATE\s+POLICY/i);
  });
});
