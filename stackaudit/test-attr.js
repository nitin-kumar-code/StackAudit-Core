const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envContent = fs.readFileSync('.env.local', 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
  const [k, v] = line.split('=');
  if (k && v) env[k.trim()] = v.trim();
});

const supabase = createClient(env['NEXT_PUBLIC_SUPABASE_URL'], env['SUPABASE_SERVICE_ROLE_KEY']);

async function test() {
  const orgId = env['DEMO_ORG_ID'];
  
  const { data: rules } = await supabase.from('attribution_rules').select('*').eq('organization_id', orgId);
  console.log('Rules:', rules);
  
  const { data: events } = await supabase.from('usage_events').select('api_key_id, provider').eq('organization_id', orgId).limit(2);
  console.log('Events:', events);
}
test();
