import { SupabaseClient } from '@supabase/supabase-js';
import { MonitoringConfig } from '../types';
import { AuditService } from '../audit/service';
import { AlertService } from './alerts/service';
import { AuditCategory } from '../types';

interface MonitoringConfigRow {
  id: string;
  organization_id: string;
  workload_id: string | null;
  enabled: boolean;
  config: MonitoringConfig['config'];
  created_at: string;
  updated_at: string;
}

export type MonitoringRunStatus = 'RUNNING' | 'COMPLETED' | 'COMPLETED_WITH_ERRORS' | 'FAILED' | 'TIMED_OUT';

const MIN_WINDOW_DAYS = 1;
const MAX_WINDOW_DAYS = 90;
const STALE_RUN_TIMEOUT_MS = 60 * 60 * 1000; // 1 hour

export class MonitoringService {
  private auditService: AuditService;
  private alertService: AlertService;

  constructor(private supabase: SupabaseClient) {
    this.auditService = new AuditService(supabase);
    this.alertService = new AlertService(supabase);
  }

  /** Run monitoring for a single org. Returns the monitoring_run ID. */
  async runMonitoring(organizationId: string): Promise<string> {
    // Reap stale runs first
    await this.reapStaleRuns();

    const startedAt = new Date();

    const { data: configs, error: configError } = await this.supabase
      .from('monitoring_configs')
      .select('*')
      .eq('enabled', true)
      .eq('organization_id', organizationId);

    if (configError) throw new Error(`Failed to load configs: ${configError.message}`);

    const { data: run, error: runError } = await this.supabase
      .from('monitoring_runs')
      .insert({
        organization_id: organizationId,
        started_at: startedAt.toISOString(),
        status: 'RUNNING' as MonitoringRunStatus
      })
      .select('id')
      .single();

    if (runError) throw new Error(`Failed to initialize monitoring run: ${runError.message}`);
    const runId = run.id;

    const { evaluatedWorkloads, findingsCount, alertsCount, errors } =
      await this.evaluateConfigs(configs || []);

    const finalStatus: MonitoringRunStatus =
      errors.length > 0
        ? (evaluatedWorkloads > 0 ? 'COMPLETED_WITH_ERRORS' : 'FAILED')
        : 'COMPLETED';

    await this.supabase
      .from('monitoring_runs')
      .update({
        completed_at: new Date().toISOString(),
        status: finalStatus,
        evaluated_workloads: evaluatedWorkloads,
        findings_count: findingsCount,
        alerts_count: alertsCount,
        error_info: errors.length > 0 ? errors.join('\n') : null
      })
      .eq('id', runId);

    return runId;
  }

  /** Run monitoring for ALL orgs (cron path). Creates one run per org. Returns run IDs. */
  async runMonitoringAllOrgs(): Promise<string[]> {
    await this.reapStaleRuns();

    const { data: configs, error: configError } = await this.supabase
      .from('monitoring_configs')
      .select('*')
      .eq('enabled', true);

    if (configError) throw new Error(`Failed to load configs: ${configError.message}`);
    if (!configs || configs.length === 0) return [];

    // Group configs by org
    const byOrg = new Map<string, MonitoringConfigRow[]>();
    for (const c of configs) {
      const orgId = c.organization_id;
      if (!byOrg.has(orgId)) byOrg.set(orgId, []);
      byOrg.get(orgId)!.push(c);
    }

    const runIds: string[] = [];

    for (const [orgId, orgConfigs] of byOrg) {
      const startedAt = new Date();

      const { data: run, error: runError } = await this.supabase
        .from('monitoring_runs')
        .insert({
          organization_id: orgId,
          started_at: startedAt.toISOString(),
          status: 'RUNNING' as MonitoringRunStatus
        })
        .select('id')
        .single();

      if (runError) {
        console.error(`Failed to create run for org ${orgId}: ${runError.message}`);
        continue;
      }

      const { evaluatedWorkloads, findingsCount, alertsCount, errors } =
        await this.evaluateConfigs(orgConfigs);

      const finalStatus: MonitoringRunStatus =
        errors.length > 0
          ? (evaluatedWorkloads > 0 ? 'COMPLETED_WITH_ERRORS' : 'FAILED')
          : 'COMPLETED';

      await this.supabase
        .from('monitoring_runs')
        .update({
          completed_at: new Date().toISOString(),
          status: finalStatus,
          evaluated_workloads: evaluatedWorkloads,
          findings_count: findingsCount,
          alerts_count: alertsCount,
          error_info: errors.length > 0 ? errors.join('\n') : null
        })
        .eq('id', run.id);

      runIds.push(run.id);
    }

    return runIds;
  }

  private async evaluateConfigs(rawConfigs: MonitoringConfigRow[]): Promise<{
    evaluatedWorkloads: number;
    findingsCount: number;
    alertsCount: number;
    errors: string[];
  }> {
    let evaluatedWorkloads = 0;
    let findingsCount = 0;
    let alertsCount = 0;
    const errors: string[] = [];

    for (const rawConfig of rawConfigs) {
      const config: MonitoringConfig = {
        id: rawConfig.id,
        organizationId: rawConfig.organization_id,
        workloadId: rawConfig.workload_id,
        enabled: rawConfig.enabled,
        config: rawConfig.config,
        createdAt: new Date(rawConfig.created_at),
        updatedAt: new Date(rawConfig.updated_at)
      };

      // Skip org-level configs without a workload (not supported in V0)
      if (!config.workloadId) continue;

      // Validate evaluationWindowDays (D7)
      const windowDays = config.config.evaluationWindowDays;
      if (!windowDays || windowDays < MIN_WINDOW_DAYS || windowDays > MAX_WINDOW_DAYS) {
        errors.push(`Config ${config.id}: evaluationWindowDays must be ${MIN_WINDOW_DAYS}-${MAX_WINDOW_DAYS}, got ${windowDays}`);
        continue;
      }

      try {
        const end = new Date();
        const start = new Date(end.getTime() - (windowDays * 24 * 60 * 60 * 1000));

        const auditResult = await this.auditService.runAudit(config.organizationId, {
          workloadId: config.workloadId,
          start,
          end
        });

        evaluatedWorkloads++;
        findingsCount += auditResult.findings.length;

        const generatedCategories = new Set(auditResult.findings.map(f => f.category));

        for (const finding of auditResult.findings) {
          const result = await this.alertService.processFinding(finding, config);
          if (result.alertCreated) alertsCount++;
        }

        // D3: Only auto-resolve categories that were actually evaluated (not skipped)
        const evaluatedRuleIds = new Set(auditResult.rulesEvaluated);
        for (const ruleId of evaluatedRuleIds) {
          if (isAuditCategory(ruleId) && !generatedCategories.has(ruleId)) {
            const fingerprint = AlertService.generateFingerprint(
              config.organizationId, config.workloadId, ruleId
            );
            await this.alertService.resolveAlert(fingerprint);
          }
        }
      } catch (err: unknown) {
        errors.push(`Config ${rawConfig.id} failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    return { evaluatedWorkloads, findingsCount, alertsCount, errors };
  }

  /** D6: Mark runs stuck in RUNNING for >1 hour as TIMED_OUT */
  private async reapStaleRuns(): Promise<void> {
    const cutoff = new Date(Date.now() - STALE_RUN_TIMEOUT_MS).toISOString();

    await this.supabase
      .from('monitoring_runs')
      .update({
        status: 'TIMED_OUT' as MonitoringRunStatus,
        completed_at: new Date().toISOString(),
        error_info: 'Run exceeded 1 hour timeout and was reaped'
      })
      .eq('status', 'RUNNING')
      .lt('started_at', cutoff);
  }
}

function isAuditCategory(value: string): value is AuditCategory {
  return ['USAGE_SPIKE', 'COST_DRIFT', 'TOKEN_EFFICIENCY', 'MODEL_MIX', 'RETRY_PATTERN'].includes(value);
}
