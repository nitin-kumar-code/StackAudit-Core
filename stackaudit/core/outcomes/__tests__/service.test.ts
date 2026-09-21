import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OutcomeService } from '../service';
import { ValidationError, WorkloadNotFoundError } from '../../workloads/service';
import { ConflictError } from '../../types';
import { SupabaseClient } from '@supabase/supabase-js';

const mockInsert = vi.fn();
const mockSelect = vi.fn();
const mockEq = vi.fn();
const mockSingle = vi.fn();
const mockRpc = vi.fn();

const mockSupabase = {
  from: vi.fn(() => ({
    insert: mockInsert,
    select: mockSelect
  })),
  rpc: mockRpc
} as unknown as SupabaseClient;

describe('OutcomeService', () => {
  const service = new OutcomeService(mockSupabase);
  const wlId = '00000000-0000-4000-a000-000000000000'; // valid UUID

  beforeEach(() => {
    vi.clearAllMocks();
    mockInsert.mockReturnValue({ select: mockSelect });
    const chainObj = { eq: mockEq, single: mockSingle };
    mockEq.mockReturnValue(chainObj);
    mockSelect.mockReturnValue(chainObj);
  });

  describe('createOutcome', () => {
    const validDto = {
      workloadId: wlId,
      outcomeType: 'ticket_resolved',
      timestamp: new Date('2026-09-01T12:00:00Z'),
      count: 10
    };

    it('rejects missing or invalid workloadId', async () => {
      await expect(service.createOutcome('org_1', { ...validDto, workloadId: '' })).rejects.toThrow(ValidationError);
      await expect(service.createOutcome('org_1', { ...validDto, workloadId: 'invalid-uuid' })).rejects.toThrow(ValidationError);
    });

    it('rejects zero or negative count', async () => {
      await expect(service.createOutcome('org_1', { ...validDto, count: 0 })).rejects.toThrow(ValidationError);
      await expect(service.createOutcome('org_1', { ...validDto, count: -5 })).rejects.toThrow(ValidationError);
    });

    it('rejects invalid outcomeType', async () => {
      await expect(service.createOutcome('org_1', { ...validDto, outcomeType: '   ' })).rejects.toThrow(ValidationError);
    });
    
    it('rejects far-future timestamps', async () => {
      const farFuture = new Date();
      farFuture.setDate(farFuture.getDate() + 5);
      await expect(service.createOutcome('org_1', { ...validDto, timestamp: farFuture })).rejects.toThrow(/future/);
    });

    it('creates a valid outcome event successfully', async () => {
      mockSingle.mockResolvedValueOnce({ data: { id: wlId }, error: null });
      mockSingle.mockResolvedValueOnce({
        data: { id: 'out_1', workload_id: wlId, outcome_type: 'ticket_resolved', timestamp: validDto.timestamp.toISOString(), count: 10, metadata: null, idempotency_key: null },
        error: null
      });

      const res = await service.createOutcome('org_1', validDto);
      expect(res.isDuplicate).toBe(false);
      expect(res.event.id).toBe('out_1');
    });

    it('handles idempotent retries properly returning existing record', async () => {
      const dtoWithIdemp = { ...validDto, idempotencyKey: 'idem_123' };
      mockSingle.mockResolvedValueOnce({ data: { id: wlId }, error: null });
      mockSingle.mockResolvedValueOnce({ data: null, error: { code: '23505', message: 'duplicate key' } });
      mockSingle.mockResolvedValueOnce({
        data: { id: 'out_1', workload_id: wlId, outcome_type: 'ticket_resolved', timestamp: validDto.timestamp.toISOString(), count: 10, metadata: null, idempotency_key: 'idem_123' },
        error: null
      });

      const res = await service.createOutcome('org_1', dtoWithIdemp);
      expect(res.isDuplicate).toBe(true);
      expect(res.event.id).toBe('out_1');
    });
    
    it('throws ConflictError on idempotency collision with different data', async () => {
      const dtoWithIdemp = { ...validDto, count: 50, idempotencyKey: 'idem_123' }; // Different count!
      mockSingle.mockResolvedValueOnce({ data: { id: wlId }, error: null });
      mockSingle.mockResolvedValueOnce({ data: null, error: { code: '23505', message: 'duplicate key' } });
      // Existing row had count = 10
      mockSingle.mockResolvedValueOnce({
        data: { id: 'out_1', workload_id: wlId, outcome_type: 'ticket_resolved', timestamp: validDto.timestamp.toISOString(), count: 10, metadata: null, idempotency_key: 'idem_123' },
        error: null
      });

      await expect(service.createOutcome('org_1', dtoWithIdemp)).rejects.toThrow(ConflictError);
    });
  });
  
  describe('Analytics', () => {
    it('validates start < end', async () => {
      await expect(service.getCostPerOutcome('org_1', wlId, 'ticket', new Date('2026-09-02'), new Date('2026-09-01'))).rejects.toThrow(/before/);
    });
    
    it('validates 366 day limit', async () => {
      await expect(service.getCostPerOutcome('org_1', wlId, 'ticket', new Date('2025-01-01'), new Date('2027-01-01'))).rejects.toThrow(/366/);
    });
  });
});
