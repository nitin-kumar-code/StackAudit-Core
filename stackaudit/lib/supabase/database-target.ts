export function validateDatabaseTarget(mode: string | undefined, supabaseUrl: string | undefined): void {
  if (mode !== 'local' && mode !== 'remote') {
    throw new Error('Set STACKAUDIT_DATABASE_MODE=local for a local preview. Remote databases require STACKAUDIT_DATABASE_MODE=remote explicitly.');
  }
  if (!supabaseUrl) throw new Error('NEXT_PUBLIC_SUPABASE_URL is required.');
  let url: URL;
  try { url = new URL(supabaseUrl); } catch { throw new Error('NEXT_PUBLIC_SUPABASE_URL must be a valid URL.'); }
  const localHost = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname);
  if (mode === 'local' && !localHost) {
    throw new Error('STACKAUDIT_DATABASE_MODE=local requires a localhost Supabase URL. Set remote mode explicitly to use a remote database.');
  }
  if (mode === 'remote' && localHost) {
    throw new Error('Remote database mode requires a non-local Supabase URL.');
  }
}
