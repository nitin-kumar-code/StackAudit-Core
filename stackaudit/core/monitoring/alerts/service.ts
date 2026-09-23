import { SupabaseClient } from '@supabase/supabase-js';
import { AuditFinding, MonitoringConfig, Severity } from '../../types';
import { NotificationChannel, NotificationPayload } from './types';
import { WebhookChannel } from './channels/webhook';

const SEVERITY_LEVELS: Record<string, number> = { 'INFO': 0, 'LOW': 1, 'MEDIUM': 2, 'HIGH': 3 };
const MAX_NOTIFICATION_ATTEMPTS = 3;

export class AlertService {
  private channels: Record<string, NotificationChannel> = {};

  constructor(private supabase: SupabaseClient) {
    const webhook = new WebhookChannel();
    this.channels[webhook.type] = webhook;
  }

  /** Pure function: deterministic fingerprint for dedup. Scoped by org + workload + category. */
  static generateFingerprint(orgId: string, workloadId: string | null | undefined, category: string): string {
    // Note: workloadId || 'global' means null and undefined both map to 'global'.
    // This is intentional for V0 — org-level alerts use 'global' in the fingerprint.
    return `${orgId}:${workloadId || 'global'}:${category}`;
  }

  /**
   * D1: Atomic alert upsert via SQL RPC.
   * D2: Notifies on creation, reopen, AND severity escalation past threshold.
   */
  async processFinding(finding: AuditFinding, config: MonitoringConfig): Promise<{ alertCreated: boolean, notified: boolean }> {
    const fingerprint = AlertService.generateFingerprint(
      finding.organizationId, finding.workloadId, finding.category
    );

    // D1: Atomic upsert via RPC — race-free, handles create/reopen/update in one round trip
    const { data, error } = await this.supabase.rpc('upsert_alert', {
      p_organization_id: finding.organizationId,
      p_workload_id: finding.workloadId || null,
      p_finding_id: finding.id,
      p_category: finding.category,
      p_severity: finding.severity,
      p_fingerprint: fingerprint
    });

    if (error) throw new Error(`Failed to upsert alert: ${error.message}`);

    const row = Array.isArray(data) ? data[0] : data;
    const alertId: string = row.alert_id;
    const wasCreated: boolean = row.was_created;
    const currentStatus: string = row.current_status;

    // Determine whether to notify
    const configMinLevel = SEVERITY_LEVELS[config.config.alertPolicy.minSeverityToNotify] || 3;
    const findingLevel = SEVERITY_LEVELS[finding.severity] || 0;
    const meetsThreshold = findingLevel >= configMinLevel;

    // D2: Check for escalation — did severity cross the notification threshold?
    let shouldNotify = false;

    if (wasCreated && meetsThreshold) {
      // New alert that meets threshold → notify
      shouldNotify = true;
    } else if (currentStatus === 'OPEN' && meetsThreshold) {
      // Existing OPEN alert — check if severity escalated past the last-notified level
      const { data: alertRow } = await this.supabase
        .from('alerts')
        .select('last_notified_severity')
        .eq('id', alertId)
        .single();

      const lastNotifiedLevel = alertRow?.last_notified_severity
        ? SEVERITY_LEVELS[alertRow.last_notified_severity] ?? -1
        : -1; // Never notified → always notify if it meets threshold

      if (findingLevel > lastNotifiedLevel) {
        shouldNotify = true;
      }
    }

    let notified = false;
    if (shouldNotify) {
      notified = await this.dispatchNotifications(alertId, finding, config);
    }

    return { alertCreated: wasCreated || currentStatus === 'OPEN', notified };
  }

  /** Auto-resolve an alert when the anomaly no longer fires. */
  async resolveAlert(fingerprint: string): Promise<boolean> {
    const { data, error } = await this.supabase
      .from('alerts')
      .update({ status: 'RESOLVED' })
      .eq('fingerprint', fingerprint)
      .in('status', ['OPEN', 'ACKNOWLEDGED'])
      .select('id');

    if (error) console.error(`Failed to resolve alert ${fingerprint}:`, error);
    return !!(data && data.length > 0);
  }

  /**
   * D4: Retry sweep for alerts that failed notification delivery.
   * Finds alerts at/above the severity threshold with notified_at IS NULL
   * and notification_attempts < MAX_NOTIFICATION_ATTEMPTS.
   */
  async retryFailedNotifications(config: MonitoringConfig): Promise<{ retried: number; succeeded: number }> {
    const configMinLevel = SEVERITY_LEVELS[config.config.alertPolicy.minSeverityToNotify] || 3;

    // Find alerts needing retry
    const { data: alerts, error } = await this.supabase
      .from('alerts')
      .select('*, audit_findings:finding_id(*)')
      .eq('organization_id', config.organizationId)
      .is('notified_at', null)
      .in('status', ['OPEN', 'ACKNOWLEDGED'])
      .lt('notification_attempts', MAX_NOTIFICATION_ATTEMPTS);

    if (error || !alerts) return { retried: 0, succeeded: 0 };

    let retried = 0;
    let succeeded = 0;

    for (const alert of alerts) {
      const alertLevel = SEVERITY_LEVELS[alert.severity] || 0;
      if (alertLevel < configMinLevel) continue;

      retried++;

      // Increment attempt count
      await this.supabase
        .from('alerts')
        .update({ notification_attempts: (alert.notification_attempts || 0) + 1 })
        .eq('id', alert.id);

      // Build a finding-like payload from the alert + its linked finding
      const finding = alert.audit_findings;
      if (!finding) continue;

      const payload: NotificationPayload = {
        event: 'ai_cost_alert',
        alertId: alert.id,
        severity: alert.severity,
        category: alert.category,
        workload: alert.workload_id,
        title: finding.title || alert.category,
        description: finding.description || '',
        evidence: finding.evidence || {},
        timestamp: new Date().toISOString()
      };

      let success = false;
      for (const channelConfig of config.config.notificationChannels) {
        const channel = this.channels[channelConfig.type];
        if (channel) {
          try {
            await channel.send(payload, channelConfig);
            success = true;
          } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            await this.supabase
              .from('alerts')
              .update({ last_notification_error: errorMsg })
              .eq('id', alert.id);
          }
        }
      }

      if (success) {
        await this.supabase
          .from('alerts')
          .update({
            notified_at: new Date().toISOString(),
            last_notified_severity: alert.severity,
            last_notification_error: null
          })
          .eq('id', alert.id);
        succeeded++;
      }
    }

    return { retried, succeeded };
  }

  private async dispatchNotifications(
    alertId: string,
    finding: AuditFinding,
    config: MonitoringConfig
  ): Promise<boolean> {
    const payload: NotificationPayload = {
      event: 'ai_cost_alert',
      alertId,
      severity: finding.severity,
      category: finding.category,
      workload: finding.workloadId,
      title: finding.title,
      description: finding.description,
      evidence: finding.evidence,
      timestamp: new Date().toISOString()
    };

    let allSuccess = true;

    for (const channelConfig of config.config.notificationChannels) {
      const channel = this.channels[channelConfig.type];
      if (!channel) continue;

      // Notification attempt is logged. Wait, without RPC we can't easily increment.
      // We will let the retry sweep (which reads and writes) handle retry counting.

      try {
        await channel.send(payload, channelConfig);
      } catch (error) {
        allSuccess = false;
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error(`Notification failed for channel ${channelConfig.type}: ${errorMsg}`);
        await this.supabase
          .from('alerts')
          .update({ last_notification_error: errorMsg })
          .eq('id', alertId);
      }
    }

    if (allSuccess && config.config.notificationChannels.length > 0) {
      await this.supabase
        .from('alerts')
        .update({
          notified_at: new Date().toISOString(),
          last_notified_severity: finding.severity,
          last_notification_error: null
        })
        .eq('id', alertId);
    }

    return allSuccess;
  }
}
