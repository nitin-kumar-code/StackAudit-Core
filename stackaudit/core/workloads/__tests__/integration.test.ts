import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { WorkloadService } from '../service';
import crypto from 'crypto';

// Fails the test runner entirely if no credentials provided, ensuring CI guarantees protection.
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY! This test is required for cross-org validation and cannot be skipped.");
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const workloadService = new WorkloadService(supabase);

describe('Workload Integration (Cross-Org Isolation)', () => {
  const orgAId = crypto.randomUUID();
  const orgBId = crypto.randomUUID();

  beforeAll(async () => {
    await supabase.from('organizations').insert([
      { id: orgAId, name: 'Org A' },
      { id: orgBId, name: 'Org B' }
    ]);
  });

  afterAll(async () => {
    await supabase.from('organizations').delete().in('id', [orgAId, orgBId]);
  });

  it('proves organization isolation and strict ambiguity prevention', async () => {
    const wlA = await workloadService.createWorkload(orgAId, { name: 'WL A' });
    const wlB = await workloadService.createWorkload(orgBId, { name: 'WL B' });

    // Org A creates a rule for key_123
    await workloadService.createAttributionRule(orgAId, wlA.id, {
      provider: 'openai',
      matchType: 'api_key',
      matchValue: 'key_123'
    });

    // Org B creates a rule for the SAME key_123
    // This MUST SUCCEED because unique constraint is (organization_id, provider, match_type, match_value)
    await workloadService.createAttributionRule(orgBId, wlB.id, {
      provider: 'openai',
      matchType: 'api_key',
      matchValue: 'key_123'
    });

    // Org A tries to create ANOTHER rule for key_123 on a different workload
    const wlA2 = await workloadService.createWorkload(orgAId, { name: 'WL A2' });
    
    // This MUST FAIL (23505 duplicate) because Org A can't ambiguously attribute the same key
    await expect(
      workloadService.createAttributionRule(orgAId, wlA2.id, {
        provider: 'openai',
        matchType: 'api_key',
        matchValue: 'key_123'
      })
    ).rejects.toThrow(); // Handled as Error inside service
  });
});
