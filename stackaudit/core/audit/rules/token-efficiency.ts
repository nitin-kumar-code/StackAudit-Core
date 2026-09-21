import { SkipError, AuditFinding } from '../../types';
import { AuditRule, AuditContext } from '../types';
import { AUDIT_THRESHOLDS } from '../thresholds';

export class TokenEfficiencyRule implements AuditRule {
  id = 'TOKEN_EFFICIENCY' as const;

  evaluate(context: AuditContext): Omit<AuditFinding, 'id' | 'detectedAt'> | null {
    const { currentMetrics, baselineMetrics, currentWindow } = context;

    if (currentMetrics.requestCount < AUDIT_THRESHOLDS.MIN_SAMPLE_SIZE || baselineMetrics.requestCount < AUDIT_THRESHOLDS.MIN_SAMPLE_SIZE) {
      throw new SkipError(`Skipped: Request volume below min sample size (${AUDIT_THRESHOLDS.MIN_SAMPLE_SIZE})`);
    }

    const baselineTokensPerReq = baselineMetrics.totalTokens / baselineMetrics.requestCount;
    const currentTokensPerReq = currentMetrics.totalTokens / currentMetrics.requestCount;

    if (baselineTokensPerReq === 0) throw new SkipError('Skipped: Baseline tokens per request is 0');

    const changeRatio = (currentTokensPerReq - baselineTokensPerReq) / baselineTokensPerReq;

    if (changeRatio > AUDIT_THRESHOLDS.TOKEN_GROWTH_PERCENT) {
      const changePercent = parseFloat((changeRatio * 100).toFixed(2));
      
      return {
        organizationId: context.organizationId,
        workloadId: context.workloadId,
        category: this.id,
        severity: changeRatio > 1.0 ? 'HIGH' : 'MEDIUM',
        confidence: baselineMetrics.requestCount > 200 ? 'HIGH' : 'MEDIUM',
        title: 'Decreased Token Efficiency',
        description: `Average tokens per request increased by ${changePercent}% compared to the baseline period.`,
        evidence: {
          metric: 'tokens_per_request',
          baseline: parseFloat(baselineTokensPerReq.toFixed(2)),
          observed: parseFloat(currentTokensPerReq.toFixed(2)),
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
