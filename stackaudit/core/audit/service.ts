import { SupabaseClient } from '@supabase/supabase-js';
import { AuditContext, TimeWindow, MetricSummary } from './types';
import { AuditFinding, AuditCategory } from '../types';
import { AuditEngine } from './engine';
import { ALL_RULES } from './rules';
import { WorkloadNotFoundError, ValidationError } from '../workloads/service';

export interface RunAuditDTO {
  workloadId: string;
  start: Date;
  end: Date;
}

export class AuditService {
  private engine: AuditEngine;

  constructor(private supabase: SupabaseClient) {
    this.engine = new AuditEngine(ALL_RULES);
  }

  async runAudit(organizationId: string, dto: RunAuditDTO): Promise<AuditFinding[]> {
    if (dto.start >= dto.end) throw new ValidationError('start must be before end');
    
    // Verify workload belongs to org
    const { data: wl, error: wlError } = await this.supabase
      .from('workloads')
      .select('id')
      .eq('id', dto.workloadId)
      .eq('organization_id', organizationId)
      .single();
      
    if (wlError || !wl) throw new WorkloadNotFoundError(dto.workloadId);

    // Build context
    const currentWindow = { start: dto.start, end: dto.end };
    
    // Simple V0 Baseline: Previous period of exact same duration
    const durationMs = dto.end.getTime() - dto.start.getTime();
    const baselineWindow = {
      start: new Date(dto.start.getTime() - durationMs),
      end: dto.start
    };

    const currentMetrics = await this.loadMetrics(organizationId, dto.workloadId, currentWindow);
    const baselineMetrics = await this.loadMetrics(organizationId, dto.workloadId, baselineWindow);

    const currentOutcomes = await this.loadOutcomes(organizationId, dto.workloadId, currentWindow);
    const baselineOutcomes = await this.loadOutcomes(organizationId, dto.workloadId, baselineWindow);

    const context: AuditContext = {
      organizationId,
      workloadId: dto.workloadId,
      currentWindow,
      baselineWindow,
      currentMetrics,
      baselineMetrics,
      currentOutcomes,
      baselineOutcomes
    };

    // Run rules
    const findings = this.engine.evaluate(context);

    // Persist and return findings
    return this.persistFindings(organizationId, dto.workloadId, findings);
  }

  private async loadMetrics(orgId: string, workloadId: string, window: TimeWindow): Promise<MetricSummary> {
    // In V0, we query the view to get aggregated metrics and model groupings
    const { data, error } = await this.supabase
      .from('v_attributed_usage_events')
      .select('calculated_cost, input_tokens, output_tokens, model')
      .eq('workload_id', workloadId)
      .eq('organization_id', orgId)
      .gte('timestamp', window.start.toISOString())
      .lt('timestamp', window.end.toISOString());

    if (error) throw new Error(`Failed to load usage for audit: ${error.message}`);

    const metrics: MetricSummary = {
      totalCost: 0,
      totalTokens: 0,
      requestCount: data.length,
      models: {}
    };

    for (const row of data || []) {
      const cost = parseFloat(row.calculated_cost) || 0;
      const tokens = (Number(row.input_tokens) || 0) + (Number(row.output_tokens) || 0);
      const model = row.model;

      metrics.totalCost += cost;
      metrics.totalTokens += tokens;

      if (!metrics.models![model]) {
        metrics.models![model] = { cost: 0, tokens: 0, requests: 0 };
      }
      metrics.models![model].cost += cost;
      metrics.models![model].tokens += tokens;
      metrics.models![model].requests += 1;
    }

    return metrics;
  }

  private async loadOutcomes(orgId: string, workloadId: string, window: TimeWindow): Promise<Record<string, number>> {
    const { data, error } = await this.supabase
      .from('outcome_events')
      .select('outcome_type, count')
      .eq('workload_id', workloadId)
      .eq('organization_id', orgId)
      .gte('timestamp', window.start.toISOString())
      .lt('timestamp', window.end.toISOString());

    if (error) throw new Error(`Failed to load outcomes for audit: ${error.message}`);

    const outcomes: Record<string, number> = {};
    for (const row of data || []) {
      const type = row.outcome_type;
      outcomes[type] = (outcomes[type] || 0) + Number(row.count);
    }

    return outcomes;
  }

  private async persistFindings(
    orgId: string, 
    workloadId: string, 
    findings: Omit<AuditFinding, 'id' | 'detectedAt'>[]
  ): Promise<AuditFinding[]> {
    if (findings.length === 0) return [];

    const records = findings.map(f => ({
      organization_id: f.organizationId,
      workload_id: f.workloadId,
      category: f.category,
      severity: f.severity,
      title: f.title,
      description: f.description,
      confidence: f.confidence,
      evidence: f.evidence,
      time_window_start: f.timeWindowStart.toISOString(),
      time_window_end: f.timeWindowEnd.toISOString()
    }));

    // Use Postgres ON CONFLICT DO NOTHING to silently ignore exact duplicate executions for the same window
    const { data, error } = await this.supabase
      .from('audit_findings')
      .upsert(records, {
        onConflict: 'organization_id, workload_id, category, time_window_start, time_window_end',
        ignoreDuplicates: false // Wait, if we use DO NOTHING, we can either ignoreDuplicates: true or let upsert update the record. Updating is fine to freshen evidence. Let's update.
      })
      .select();

    if (error) {
      throw new Error(`Failed to persist audit findings: ${error.message}`);
    }

    return (data || []).map((row: any) => ({
      id: row.id,
      organizationId: row.organization_id,
      workloadId: row.workload_id,
      category: row.category as AuditCategory,
      severity: row.severity,
      title: row.title,
      description: row.description,
      confidence: row.confidence,
      evidence: row.evidence,
      timeWindowStart: new Date(row.time_window_start),
      timeWindowEnd: new Date(row.time_window_end),
      detectedAt: new Date(row.detected_at)
    }));
  }
}
