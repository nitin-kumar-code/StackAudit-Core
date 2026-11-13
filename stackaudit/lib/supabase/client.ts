import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { validateDatabaseTarget } from './database-target';

function getDatabaseConfig() {
  const mode = process.env.STACKAUDIT_DATABASE_MODE;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  // During Next.js build / page data collection when no environment file is present,
  // provide a safe localhost fallback so routes can be prerendered/analyzed without crashing.
  if (process.env.NEXT_PHASE === 'phase-production-build' || (!mode && !supabaseUrl && !supabaseKey)) {
    return {
      supabaseUrl: supabaseUrl || 'http://127.0.0.1:54321',
      supabaseKey: supabaseKey || 'placeholder-service-role-key-for-build',
    };
  }

  validateDatabaseTarget(mode, supabaseUrl);
  if (!supabaseUrl) throw new Error('NEXT_PUBLIC_SUPABASE_URL is required on the server.');
  if (!supabaseKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required on the server.');

  return { supabaseUrl, supabaseKey };
}

const { supabaseUrl, supabaseKey } = getDatabaseConfig();
// Server-only privileged client. Never import this module from client components.
export const supabaseAdmin = createClient(supabaseUrl, supabaseKey);
