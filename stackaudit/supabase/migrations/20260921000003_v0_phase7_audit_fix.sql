-- Safely add status column
ALTER TABLE audit_findings ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'OPEN';

-- Add constraints check for status
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'audit_findings_status_check'
    ) THEN
        ALTER TABLE audit_findings ADD CONSTRAINT audit_findings_status_check CHECK (status IN ('OPEN', 'DISMISSED', 'RESOLVED'));
    END IF;
END $$;
