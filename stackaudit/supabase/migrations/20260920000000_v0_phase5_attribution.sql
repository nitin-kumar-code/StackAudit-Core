-- Drop the existing unique constraint to alter columns safely
ALTER TABLE attribution_rules DROP CONSTRAINT IF EXISTS attribution_rules_workload_id_rule_type_rule_value_key;

-- Add organization_id, provider to attribution_rules
-- We assume it's early in V0 and truncate the table if needed, or just set org from workload
ALTER TABLE attribution_rules ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

-- Backfill organization_id from workloads (in case there's data)
UPDATE attribution_rules r 
SET organization_id = w.organization_id 
FROM workloads w 
WHERE r.workload_id = w.id AND r.organization_id IS NULL;

ALTER TABLE attribution_rules ALTER COLUMN organization_id SET NOT NULL;

-- Rename and type columns for Provider + Match isolation
ALTER TABLE attribution_rules RENAME COLUMN rule_type TO match_type;
ALTER TABLE attribution_rules RENAME COLUMN rule_value TO match_value;
ALTER TABLE attribution_rules ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'openai';
ALTER TABLE attribution_rules ALTER COLUMN provider DROP DEFAULT;

-- Add strict ambiguity prevention constraint
ALTER TABLE attribution_rules ADD CONSTRAINT unique_org_provider_match UNIQUE (organization_id, provider, match_type, match_value);

-- Add api_key_id to usage_events for retroactive query-time mapping
ALTER TABLE usage_events ADD COLUMN IF NOT EXISTS api_key_id TEXT;
ALTER TABLE usage_events DROP COLUMN IF EXISTS workload_id;

-- Create query-time attribution view with security_invoker = true
CREATE OR REPLACE VIEW v_attributed_usage_events WITH (security_invoker = true) AS
SELECT 
    u.*,
    r.workload_id
FROM usage_events u
LEFT JOIN attribution_rules r 
    ON u.organization_id = r.organization_id 
    AND u.provider = r.provider 
    AND r.match_type = 'api_key' 
    AND u.api_key_id = r.match_value;

-- Add performance indexes
CREATE INDEX IF NOT EXISTS idx_usage_events_attribution ON usage_events(organization_id, provider, api_key_id);
CREATE INDEX IF NOT EXISTS idx_attribution_rules_match ON attribution_rules(organization_id, provider, match_type, match_value);

