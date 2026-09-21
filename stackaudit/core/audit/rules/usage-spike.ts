import { SkipError, AuditFinding } from '../../types';
import { AuditRule, AuditContext } from '../types';
import { AUDIT_THRESHOLDS } from '../thresholds';

export class UsageSpikeRule implements AuditRule {
  id = 'USAGE_SPIKE' as const;

  evaluate(context: AuditContext): Omit<AuditFinding, 'id' | 'detectedAt'> | null {
    const { currentMetrics, baselineMetrics, currentWindow } = context;

    if (currentMetrics.requestCount < AUDIT_THRESHOLDS.MIN_SAMPLE_SIZE || baselineMetrics.requestCount < AUDIT_THRESHOLDS.MIN_SAMPLE_SIZE) {
      throw new SkipError(`Skipped: Request volume below min sample size (${AUDIT_THRESHOLDS.MIN_SAMPLE_SIZE})`);
    }

    const changeRatio = (currentMetrics.requestCount - baselineMetrics.requestCount) / baselineMetrics.requestCount;

    if (changeRatio > AUDIT_THRESHOLDS.USAGE_SPIKE_PERCENT) {
      const changePercent = parseFloat((changeRatio * 100).toFixed(2));
      
      return {
        organizationId: context.organizationId,
        workloadId: context.workloadId,
        category: this.id,
        severity: changeRatio > AUDIT_THRESHOLDS.HIGH_SEVERITY_SPIKE_PERCENT ? 'HIGH' : 'MEDIUM',
        confidence: baselineMetrics.requestCount > AUDIT_THRESHOLDS.HIGH_CONFIDENCE_SPIKE_VOLUME ? 'HIGH' : 'MEDIUM',
        title: 'Significant Usage Spike Detected',
        description: `Usage volume increased by ${changePercent}% compared to the baseline period.`,
        evidence: {
          metric: 'request_count',
          baseline: baselineMetrics.requestCount,
          observed: currentMetrics.requestCount,
          changePercent,
          sampleSize: currentMetrics.requestCount,
          windowStart: currentWindow.start.toISOString(),
          windowEnd: currentWindow.end.toISOString()
        },
        timeWindowStart: currentWindow.start,
        timeWindowEnd: currentWindow.end,
        status: 'OPEN'
      };
    }

    return null;
  }
}
