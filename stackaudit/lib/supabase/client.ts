import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// A server-side only client with service role or anon key.
// Ensure this is NEVER imported in client components!
export const supabaseAdmin = createClient(supabaseUrl, supabaseKey);
