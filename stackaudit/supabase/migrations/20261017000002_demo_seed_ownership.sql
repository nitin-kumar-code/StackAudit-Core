-- Mark the one dedicated demo organization so seed cleanup can verify ownership.
-- Existing organizations remain unmarked and cannot be cleaned by the demo seeder.
ALTER TABLE organizations
    ADD COLUMN IF NOT EXISTS demo_seed_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS organizations_demo_seed_key_unique
    ON organizations (demo_seed_key)
    WHERE demo_seed_key IS NOT NULL;
