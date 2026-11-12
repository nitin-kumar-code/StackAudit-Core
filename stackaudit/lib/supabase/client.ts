import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { validateDatabaseTarget } from './database-target';

function getDatabaseConfig() {
  const mode = process.env.STACKAUDIT_DATABASE_MODE;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  validateDatabaseTarget(mode, supabaseUrl);
  if (!supabaseUrl) throw new Error('NEXT_PUBLIC_SUPABASE_URL is required on the server.');
  if (!supabaseKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required on the server.');

  return { supabaseUrl, supabaseKey };
}

const { supabaseUrl, supabaseKey } = getDatabaseConfig();
// Server-only privileged client. Never import this module from client components.
export const supabaseAdmin = createClient(supabaseUrl, supabaseKey);
