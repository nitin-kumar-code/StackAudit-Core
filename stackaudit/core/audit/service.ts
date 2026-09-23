import { SupabaseClient } from '@supabase/supabase-js';
import { AuditContext, TimeWindow, MetricSummary } from './types';
import { AuditFinding, AuditCategory } from '../types';
import { AuditEngine, AuditEngineResult } from './engine';
import { ALL_RULES } from './rules';
import { WorkloadNotFoundError, ValidationError } from '../workloads/service';

export interface RunAuditDTO {
  workloadId: string;
  start: Date;
  end: Date;
}

export interface RunAuditResult {
  window: { start: string; end: string };
  findings: AuditFinding[];
  rulesEvaluated: string[];
  rulesSkipped: { ruleId: string; reason: string }[];
}

export class AuditService {
  private engine: AuditEngine;

  constructor(private supabase: SupabaseClient) {
    this.engine = new AuditEngine(ALL_RULES);
  }

  async runAudit(organizationId: string, dto: RunAuditDTO): Promise<RunAuditResult> {
    if (dto.start >= dto.end) throw new ValidationError('start must be before end');
    
    // Validate range cap (366 days max)
    const MAX_DAYS = 366;
    if ((dto.end.getTime() - dto.start.getTime()) > MAX_DAYS * 24 * 60 * 60 * 1000) {
      throw new ValidationError(`Range exceeds maximum of ${MAX_DAYS} days`);
    }

    const { data: wl, error: wlError } = await this.supabase
      .from('workloads')
      .select('id')
      .eq('id', dto.workloadId)
      .eq('organization_id', organizationId)
      .single();
      
    if (wlError || !wl) throw new WorkloadNotFoundError(dto.workloadId);

    // B5: Fetch sync watermarks to clamp end date
    const { data: watermarks } = await this.supabase
      .from('provider_sync_state')
      .select('last_ingested_bucket_end')
      .eq('organization_id', organizationId);

    // Snap to UTC Day boundaries
    const snappedStart = new Date(Date.UTC(dto.start.getUTCFullYear(), dto.start.getUTCMonth(), dto.start.getUTCDate()));
    let snappedEnd = new Date(Date.UTC(dto.end.getUTCFullYear(), dto.end.getUTCMonth(), dto.end.getUTCDate()));
    
    // Clamp end to UTC midnight today (minus 1 day for ingestion lag safety)
    const now = new Date();
    const todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    let maxSafeEnd = todayUTC;

    // B5: If we have watermarks, the max safe end is the minimum of those watermarks
    if (watermarks && watermarks.length > 0) {
      const minWatermark = new Date(Math.min(...watermarks.map(w => new Date(w.last_ingested_bucket_end).getTime())));
      if (minWatermark.getTime() < maxSafeEnd.getTime()) {
        maxSafeEnd = minWatermark;
      }
    }

    if (snappedEnd.getTime() > maxSafeEnd.getTime()) {
      snappedEnd = maxSafeEnd;
    }
    
    const currentWindow = { start: snappedStart, end: snappedEnd };
    const durationMs = currentWindow.end.getTime() - currentWindow.start.getTime();
    if (durationMs <= 0) throw new ValidationError('Effective query window resolves to 0 or negative days after snapping/clamping to watermark');

    const baselineWindow = {
      start: new Date(currentWindow.start.getTime() - durationMs),
      end: currentWindow.start
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

    const evaluation = this.engine.evaluate(context);
    
    // B5: Flag findings with stale watermark warning
    if (watermarks && watermarks.length > 0) {
      const minWatermarkTime = Math.min(...watermarks.map(w => new Date(w.last_ingested_bucket_end).getTime()));
      if (minWatermarkTime < currentWindow.end.getTime()) {
        for (const finding of evaluation.findings) {
          finding.confidence = 'LOW';
          if (!finding.evidence.details) finding.evidence.details = {};
          finding.evidence.details.watermarkWarning = 'Data completeness not guaranteed. Provider sync watermark is earlier than window end.';
        }
      }
    }

    const persisted = await this.persistFindings(organizationId, dto.workloadId, evaluation.findings, currentWindow);

    return {
      window: { start: currentWindow.start.toISOString(), end: currentWindow.end.toISOString() },
      findings: persisted,
      rulesEvaluated: evaluation.rulesEvaluated,
      rulesSkipped: evaluation.rulesSkipped
    };
  }

  private async loadMetrics(orgId: string, workloadId: string, window: TimeWindow): Promise<MetricSummary> {
    const { data, error } = await this.supabase.rpc('aggregate_audit_metrics', {
      p_organization_id: orgId,
      p_workload_id: workloadId,
      p_start_time: window.start.toISOString(),
      p_end_time: window.end.toISOString()
    });

    if (error) throw new Error(`Failed to load usage for audit via RPC: ${error.message}`);
    
    if (!data || data.length === 0) {
      return { totalCost: 0, totalTokens: 0, requestCount: 0, unpricedEvents: 0, models: {} };
    }
    
    const row = data[0];

    return {
      totalCost: parseFloat(row.total_cost) || 0,
      totalTokens: parseFloat(row.total_tokens) || 0,
      requestCount: Number(row.request_count) || 0,
      unpricedEvents: Number(row.unpriced_events) || 0,
      models: row.models || {}
    };
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
    findings: Omit<AuditFinding, 'id' | 'detectedAt' | 'status'>[],
    window: TimeWindow
  ): Promise<AuditFinding[]> {
    
    // C3: Stale finding resolution
    // Resolve any OPEN findings for this org+workload+window that did NOT fire this time
    const activeCategories = findings.map(f => f.category);
    let staleQuery = this.supabase
      .from('audit_findings')
      .update({ status: 'RESOLVED' })
      .eq('organization_id', orgId)
      .eq('status', 'OPEN')
      .eq('time_window_start', window.start.toISOString());
      
    if (workloadId) {
      staleQuery = staleQuery.eq('workload_id', workloadId);
    } else {
      staleQuery = staleQuery.is('workload_id', null);
    }

    if (activeCategories.length > 0) {
      staleQuery = staleQuery.not('category', 'in', `(${activeCategories.join(',')})`);
    }

    await staleQuery;

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

    const { error } = await this.supabase.rpc('upsert_audit_findings', {
      p_findings: records
    });

    if (error) {
      throw new Error(`Failed to persist audit findings via RPC: ${error.message}`);
    }
    
    // Fetch updated records
    const { data: freshFindings } = await this.supabase
      .from('audit_findings')
      .select('*')
      .eq('organization_id', orgId)
      .eq('workload_id', workloadId);
      
    const relevant = (freshFindings || []).filter(f => 
       findings.some(orig => orig.category === f.category && 
       new Date(f.time_window_start).getTime() === orig.timeWindowStart.getTime())
    );

    return relevant.map((row: any) => ({
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
      detectedAt: new Date(row.detected_at),
      status: row.status
    }));
  }
}
