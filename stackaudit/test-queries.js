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
  
  // Test alerts + findings
  const { data: alerts } = await supabase
    .from('alerts')
    .select('*, audit_findings(*)')
    .eq('organization_id', orgId)
    .eq('status', 'OPEN')
    .limit(3);
    
  console.log('Alerts:', JSON.stringify(alerts, null, 2));

  // Test workloads
  const { data: workloads } = await supabase
    .from('workloads')
    .select('id, name')
    .eq('organization_id', orgId);
    
  // Test attributed usage
  const { data: usage } = await supabase
    .from('v_attributed_usage_events')
    .select('workload_id, calculated_cost, input_tokens, output_tokens')
    .eq('organization_id', orgId);
    
  console.log('Attributed Usage sample:', usage ? usage.slice(0,2) : usage);
}
test();
