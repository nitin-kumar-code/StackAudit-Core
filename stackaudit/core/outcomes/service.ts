import { SupabaseClient } from '@supabase/supabase-js';
import { OutcomeEvent, CostPerOutcomeResult, CostPerOutcomeDataPoint, ConflictError, JsonObject } from '../types';
import { WorkloadNotFoundError, ValidationError } from '../workloads/service';
import { calculateCostPerOutcome } from '../usage/metrics';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
interface DailyOutcomeAggregateRow {
  total_outcomes: string | number | null;
  unpriced_events: number | null;
  priced_events: number | null;
  known_cost: string | null;
  total_cost: string | null;
  period_start: string;
}

export interface CreateOutcomeDTO {
  workloadId: string;
  outcomeType: string;
  timestamp: Date;
  count: number;
  metadata?: JsonObject;
  idempotencyKey?: string;
}

export class OutcomeService {
  constructor(private supabase: SupabaseClient) {}

  private validateAnalyticsParams(workloadId: string, startTime: Date, endTime: Date) {
    if (!UUID_REGEX.test(workloadId)) throw new ValidationError('Invalid workloadId format');
    if (startTime >= endTime) throw new ValidationError('startTime must be strictly before endTime');
    
    const diffDays = (endTime.getTime() - startTime.getTime()) / (1000 * 3600 * 24);
    if (diffDays > 366) throw new ValidationError('Query range cannot exceed 366 days');
  }

  async createOutcome(organizationId: string, dto: CreateOutcomeDTO): Promise<{ event: OutcomeEvent, isDuplicate: boolean }> {
    if (!UUID_REGEX.test(dto.workloadId)) throw new ValidationError('Invalid workloadId format');
    if (!dto.outcomeType || dto.outcomeType.trim() === '') throw new ValidationError('outcomeType is required and must not be empty');
    if (dto.outcomeType.length > 255) throw new ValidationError('outcomeType exceeds maximum length (255)');
    if (dto.idempotencyKey && dto.idempotencyKey.length > 255) throw new ValidationError('idempotencyKey exceeds maximum length (255)');
    if (!Number.isInteger(dto.count) || dto.count <= 0) throw new ValidationError('count must be a positive integer');
    
    if (!(dto.timestamp instanceof Date) || isNaN(dto.timestamp.getTime())) throw new ValidationError('timestamp must be a valid date');
    const futureLimit = new Date();
    futureLimit.setDate(futureLimit.getDate() + 1);
    if (dto.timestamp > futureLimit) throw new ValidationError('timestamp cannot be more than 1 day in the future');

    if (dto.metadata && JSON.stringify(dto.metadata).length > 10240) {
      throw new ValidationError('metadata exceeds maximum size (10KB)');
    }

    const { data: workload, error: wlError } = await this.supabase
      .from('workloads')
      .select('id')
      .eq('id', dto.workloadId)
      .eq('organization_id', organizationId)
      .single();
      
    if (wlError || !workload) throw new WorkloadNotFoundError(dto.workloadId);

    const { data, error } = await this.supabase
      .from('outcome_events')
      .insert({
        organization_id: organizationId,
        workload_id: dto.workloadId,
        outcome_type: dto.outcomeType.trim(),
        timestamp: dto.timestamp.toISOString(),
        count: dto.count,
        metadata: dto.metadata || null,
        idempotency_key: dto.idempotencyKey || null
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505' && dto.idempotencyKey) {
        const { data: existing } = await this.supabase
          .from('outcome_events')
          .select('*')
          .eq('workload_id', dto.workloadId)
          .eq('idempotency_key', dto.idempotencyKey)
          .single();
          
        if (existing) {
          // Strictly reject if idempotency payload mutated
          if (existing.count !== dto.count || existing.outcome_type !== dto.outcomeType) {
            throw new ConflictError('Idempotency conflict: A request with this key already exists but with different parameters.');
          }

          return {
            event: {
              id: existing.id, organizationId,
              workloadId: existing.workload_id,
              outcomeType: existing.outcome_type,
              timestamp: new Date(existing.timestamp),
              count: existing.count,
              metadata: existing.metadata,
              idempotencyKey: existing.idempotency_key
            },
            isDuplicate: true
          };
        }
      }
      throw new Error(`Failed to insert outcome event: ${error.message}`);
    }

    return {
      event: {
        id: data.id, organizationId,
        workloadId: data.workload_id,
        outcomeType: data.outcome_type,
        timestamp: new Date(data.timestamp),
        count: data.count,
        metadata: data.metadata,
        idempotencyKey: data.idempotency_key
      },
      isDuplicate: false
    };
  }

  async getCostPerOutcome(
    organizationId: string,
    workloadId: string,
    outcomeType: string,
    startTime: Date,
    endTime: Date
  ): Promise<CostPerOutcomeResult> {
    this.validateAnalyticsParams(workloadId, startTime, endTime);

    const { data, error } = await this.supabase.rpc('aggregate_cost_and_outcomes', {
      p_organization_id: organizationId,
      p_workload_id: workloadId,
      p_outcome_type: outcomeType,
      p_start_time: startTime.toISOString(),
      p_end_time: endTime.toISOString()
    });

    if (error) throw new Error(`Failed to calculate cost per outcome: ${error.message}`);

    const result = data?.[0] || { known_cost: '0', total_cost: '0', total_outcomes: '0', unpriced_events: 0, priced_events: 0 };
    const totalOutcomeCount = Number(result.total_outcomes || 0);
    const unpricedEventCount = Number(result.unpriced_events || 0);
    const pricedEventCount = Number(result.priced_events || 0);
    const isCostComplete = unpricedEventCount === 0;
    const knownCost = pricedEventCount > 0 || unpricedEventCount === 0 ? String(result.known_cost ?? '0') : null;
    const totalCost = isCostComplete ? String(result.total_cost ?? '0') : null;
    const cpo = calculateCostPerOutcome({
      knownCost,
      totalCost,
      isComplete: isCostComplete,
      pricedEventCount,
      unpricedEventCount
    }, totalOutcomeCount);

    return {
      workloadId,
      outcomeType,
      startTime,
      endTime,
      totalCost,
      knownCost,
      isCostComplete,
      pricedEventCount,
      totalOutcomeCount,
      costPerOutcome: cpo.value,
      unpricedEventCount,
      availabilityReason: cpo.reason,
      
      currency: 'USD',
      costAllocationNote: 'Unallocated. This workload cost per outcome represents the total workload cost divided by this outcome type. It does not partition cost among different outcome types.'
    };
  }

  async getCostPerOutcomeSeries(
    organizationId: string,
    workloadId: string,
    outcomeType: string,
    startTime: Date,
    endTime: Date
  ): Promise<CostPerOutcomeDataPoint[]> {
    this.validateAnalyticsParams(workloadId, startTime, endTime);

    const { data, error } = await this.supabase.rpc('aggregate_daily_cost_and_outcomes', {
      p_organization_id: organizationId,
      p_workload_id: workloadId,
      p_outcome_type: outcomeType,
      p_start_time: startTime.toISOString(),
      p_end_time: endTime.toISOString()
    });

    if (error) throw new Error(`Failed to calculate daily cost per outcome: ${error.message}`);

    return ((data || []) as DailyOutcomeAggregateRow[]).map((d) => {
      const outcomeCount = Number(d.total_outcomes || 0);
      const unpricedEventCount = Number(d.unpriced_events || 0);
      const pricedEventCount = Number(d.priced_events || 0);
      const isCostComplete = unpricedEventCount === 0;
      const knownCost = pricedEventCount > 0 || unpricedEventCount === 0 ? String(d.known_cost ?? '0') : null;
      const totalCost = isCostComplete ? String(d.total_cost ?? '0') : null;
      const cpo = calculateCostPerOutcome({ knownCost, totalCost, isComplete: isCostComplete, pricedEventCount, unpricedEventCount }, outcomeCount);

      return {
        periodStart: new Date(d.period_start),
        periodEnd: new Date(new Date(d.period_start).getTime() + 86400000), 
        totalCost,
        knownCost,
        isCostComplete,
        pricedEventCount,
        outcomeCount,
        costPerOutcome: cpo.value,
        unpricedEventCount,
        availabilityReason: cpo.reason
      };
    });
  }
}
