import { AuditRule, AuditContext } from '../types';
import { AuditFinding } from '../../types';
import { AUDIT_THRESHOLDS } from '../thresholds';

export class CostDriftRule implements AuditRule {
  id = 'COST_DRIFT' as const;

  evaluate(context: AuditContext): Omit<AuditFinding, 'id' | 'detectedAt'> | null {
    const { currentMetrics, baselineMetrics, currentWindow, currentOutcomes, baselineOutcomes } = context;

    if (baselineMetrics.totalCost < AUDIT_THRESHOLDS.MIN_BASELINE_COST_USD) return null;
    if (baselineMetrics.requestCount === 0 || currentMetrics.requestCount === 0) return null;

    const costChangeRatio = (currentMetrics.totalCost - baselineMetrics.totalCost) / baselineMetrics.totalCost;
    const costChangePercent = parseFloat((costChangeRatio * 100).toFixed(2));
    
    // Calculate outcome volume change if available, otherwise fallback to request volume change
    let volumeChangeRatio = 0;
    let volumeMetric = 'request_count';
    let baselineVol = baselineMetrics.requestCount;
    let currentVol = currentMetrics.requestCount;

    if (currentOutcomes && baselineOutcomes) {
      // Sum all outcomes if multiple types exist
      const bOutcomes = Object.values(baselineOutcomes).reduce((a, b) => a + b, 0);
      const cOutcomes = Object.values(currentOutcomes).reduce((a, b) => a + b, 0);
      
      if (bOutcomes > 0) {
        volumeChangeRatio = (cOutcomes - bOutcomes) / bOutcomes;
        volumeMetric = 'outcome_count';
        baselineVol = bOutcomes;
        currentVol = cOutcomes;
      } else {
        volumeChangeRatio = (currentMetrics.requestCount - baselineMetrics.requestCount) / baselineMetrics.requestCount;
      }
    } else {
      volumeChangeRatio = (currentMetrics.requestCount - baselineMetrics.requestCount) / baselineMetrics.requestCount;
    }
    
    const volumeChangePercent = parseFloat((volumeChangeRatio * 100).toFixed(2));

    // A drift is when cost increases significantly MORE than volume
    // E.g., usage increases 10%, but cost increases 50%
    const driftRatio = costChangeRatio - volumeChangeRatio;

    if (driftRatio > AUDIT_THRESHOLDS.COST_DRIFT_PERCENT) {
      return {
        organizationId: context.organizationId,
        workloadId: context.workloadId,
        category: this.id,
        severity: driftRatio > 0.6 ? 'HIGH' : 'MEDIUM',
        confidence: baselineVol > 100 ? 'HIGH' : 'MEDIUM',
        title: 'Disproportionate Cost Drift',
        description: `Cost increased by ${costChangePercent}% while ${volumeMetric.replace('_', ' ')} changed by only ${volumeChangePercent}%.`,
        evidence: {
          metric: 'cost_drift',
          baseline: baselineMetrics.totalCost,
          observed: currentMetrics.totalCost,
          changePercent: costChangePercent,
          sampleSize: currentMetrics.requestCount,
          windowStart: currentWindow.start.toISOString(),
          windowEnd: currentWindow.end.toISOString(),
          details: {
            volumeMetric,
            volumeChangePercent,
            baselineVolume: baselineVol,
            currentVolume: currentVol
          }
        },
        timeWindowStart: currentWindow.start,
        timeWindowEnd: currentWindow.end
      };
    }

    return null;
  }
}
