import { AuditRule, AuditContext } from '../types';
import { AuditFinding } from '../../types';
import { AUDIT_THRESHOLDS } from '../thresholds';

export class UsageSpikeRule implements AuditRule {
  id = 'USAGE_SPIKE' as const;

  evaluate(context: AuditContext): Omit<AuditFinding, 'id' | 'detectedAt'> | null {
    const { currentMetrics, baselineMetrics, currentWindow } = context;

    // Need enough data to evaluate safely
    if (currentMetrics.requestCount < AUDIT_THRESHOLDS.MIN_SAMPLE_SIZE) {
      return null;
    }
    if (baselineMetrics.requestCount === 0) {
      return null;
    }

    const changeRatio = (currentMetrics.requestCount - baselineMetrics.requestCount) / baselineMetrics.requestCount;

    if (changeRatio > AUDIT_THRESHOLDS.USAGE_SPIKE_PERCENT) {
      const changePercent = parseFloat((changeRatio * 100).toFixed(2));
      
      return {
        organizationId: context.organizationId,
        workloadId: context.workloadId,
        category: this.id,
        severity: changeRatio > 1.0 ? 'HIGH' : 'MEDIUM',
        confidence: baselineMetrics.requestCount > 500 ? 'HIGH' : 'MEDIUM',
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
        timeWindowEnd: currentWindow.end
      };
    }

    return null;
  }
}
