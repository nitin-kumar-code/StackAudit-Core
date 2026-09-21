-- 1. Ensure isolation
ALTER TABLE audit_findings ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

-- V0: safe to clear previous mock data if any, since it lacked org isolation and required fields
TRUNCATE TABLE audit_findings;

ALTER TABLE audit_findings ALTER COLUMN organization_id SET NOT NULL;

-- 2. Expand domain model
ALTER TABLE audit_findings ADD COLUMN IF NOT EXISTS severity TEXT NOT NULL;
ALTER TABLE audit_findings ADD COLUMN IF NOT EXISTS title TEXT NOT NULL;
ALTER TABLE audit_findings ADD COLUMN IF NOT EXISTS time_window_start TIMESTAMPTZ NOT NULL;
ALTER TABLE audit_findings ADD COLUMN IF NOT EXISTS time_window_end TIMESTAMPTZ NOT NULL;

-- Rename 'finding' to 'description' for clarity with new domain model, or keep it. Let's rename to description.
ALTER TABLE audit_findings RENAME COLUMN finding TO description;
ALTER TABLE audit_findings RENAME COLUMN timestamp TO detected_at;

-- 3. Idempotency Constraint
-- A workload shouldn't have duplicate findings of the same category for the exact same time window
CREATE UNIQUE INDEX unique_audit_finding_workload 
ON audit_findings (organization_id, workload_id, category, time_window_start, time_window_end)
WHERE workload_id IS NOT NULL;

CREATE UNIQUE INDEX unique_audit_finding_org 
ON audit_findings (organization_id, category, time_window_start, time_window_end)
WHERE workload_id IS NULL;

