import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkloadService, WorkloadNotFoundError } from '../service';
import { SupabaseClient } from '@supabase/supabase-js';

const mockInsert = vi.fn();
const mockSelect = vi.fn();
const mockEq = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockOrder = vi.fn();
const mockSingle = vi.fn();

const mockSupabase = {
  from: vi.fn(() => ({
    insert: mockInsert,
    select: mockSelect,
    update: mockUpdate,
    delete: mockDelete
  }))
} as unknown as SupabaseClient;

describe('WorkloadService', () => {
  const service = new WorkloadService(mockSupabase);

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockInsert.mockReturnValue({ select: mockSelect });
    mockUpdate.mockReturnValue({ eq: mockEq });
    mockDelete.mockReturnValue({ eq: mockEq });
    
    const chainObj = {
      eq: mockEq,
      select: mockSelect,
      single: mockSingle,
      order: mockOrder
    };
    mockEq.mockReturnValue(chainObj);
    mockSelect.mockReturnValue(chainObj);
    mockOrder.mockReturnValue({ data: [], error: null });
  });

  describe('createAttributionRule', () => {
    it('creates rule when workload exists', async () => {
      mockSingle.mockResolvedValueOnce({
        data: { id: 'w_1', organization_id: 'org_1', name: 'WL', created_at: '2026-01-01T00:00:00Z' },
        error: null
      });
      mockSingle.mockResolvedValueOnce({
        data: { id: 'r_1', organization_id: 'org_1', workload_id: 'w_1', provider: 'openai', match_type: 'api_key', match_value: 'key_123', created_at: '2026-01-01T00:00:00Z' },
        error: null
      });

      const rule = await service.createAttributionRule('org_1', 'w_1', { provider: 'openai', matchType: 'api_key', matchValue: 'key_123' });
      expect(rule.id).toBe('r_1');
      expect(rule.organizationId).toBe('org_1');
    });

    it('throws WorkloadNotFoundError if creating rule for missing workload', async () => {
      mockSingle.mockResolvedValueOnce({ data: null, error: { message: 'Not found' } });
      
      await expect(service.createAttributionRule('org_1', 'w_1', { provider: 'openai', matchType: 'api_key', matchValue: 'key_123' }))
        .rejects.toThrow(WorkloadNotFoundError);
    });

    it('throws ValidationError if unique constraint is violated', async () => {
      mockSingle.mockResolvedValueOnce({
        data: { id: 'w_1', organization_id: 'org_1', name: 'WL', created_at: '2026-01-01T00:00:00Z' },
        error: null
      });
      mockSingle.mockResolvedValueOnce({
        data: null,
        error: { code: '23505', message: 'duplicate key value' }
      });

      await expect(service.createAttributionRule('org_1', 'w_1', { provider: 'openai', matchType: 'api_key', matchValue: 'key_123' }))
        .rejects.toThrow(/already attributed/);
    });
  });
});
