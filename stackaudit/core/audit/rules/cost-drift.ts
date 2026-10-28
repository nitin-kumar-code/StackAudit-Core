import { SkipError, AuditFinding } from '../../types';
import { AuditRule, AuditContext } from '../types';
import { AUDIT_THRESHOLDS } from '../thresholds';

export class CostDriftRule implements AuditRule {
  id = 'COST_DRIFT' as const;

  evaluate(context: AuditContext): Omit<AuditFinding, 'id' | 'detectedAt'> | null {
    const { currentMetrics, baselineMetrics, currentWindow, currentOutcomes, baselineOutcomes } = context;

    if (baselineMetrics.totalCost < AUDIT_THRESHOLDS.MIN_BASELINE_COST_USD) {
      throw new SkipError(`Skipped: Baseline cost below threshold ($${AUDIT_THRESHOLDS.MIN_BASELINE_COST_USD})`);
    }
    if (baselineMetrics.requestCount === 0 || currentMetrics.requestCount === 0) {
      throw new SkipError('Skipped: Insufficient request volume');
    }
    if (currentMetrics.requestCount < AUDIT_THRESHOLDS.MIN_SAMPLE_SIZE || baselineMetrics.requestCount < AUDIT_THRESHOLDS.MIN_SAMPLE_SIZE) {
      throw new SkipError(`Skipped: Request volume below min sample size (${AUDIT_THRESHOLDS.MIN_SAMPLE_SIZE})`);
    }
    // Check both windows for unpriced events!
    if (currentMetrics.unpricedEvents > 0 || baselineMetrics.unpricedEvents > 0) {
      throw new SkipError('Skipped: Window contains unpriced events, understating cost');
    }

    let volumeMetric = 'requests';
    let baselineVol = baselineMetrics.requestCount;
    let currentVol = currentMetrics.requestCount;

    if (currentOutcomes && baselineOutcomes) {
      const bKeys = Object.keys(baselineOutcomes);
      
      if (bKeys.length > 0) {
        const primaryOutcome = bKeys.reduce((a, b) => baselineOutcomes[a] > baselineOutcomes[b] ? a : b);
        
        if (baselineOutcomes[primaryOutcome] > 0) {
          if (!currentOutcomes[primaryOutcome] || currentOutcomes[primaryOutcome] === 0) {
             throw new SkipError(`Skipped: Outcome feed for '${primaryOutcome}' dropped to 0 in current window`);
          }
          volumeMetric = `outcome_${primaryOutcome}`;
          baselineVol = baselineOutcomes[primaryOutcome];
          currentVol = currentOutcomes[primaryOutcome];
        }
      }
    }

    const baselineUnitCost = baselineMetrics.totalCost / baselineVol;
    const currentUnitCost = currentMetrics.totalCost / currentVol;

    const driftRatio = (currentUnitCost / baselineUnitCost) - 1;

    if (driftRatio > AUDIT_THRESHOLDS.COST_DRIFT_PERCENT) {
      const driftPercent = parseFloat((driftRatio * 100).toFixed(2));
      const severity = driftRatio > AUDIT_THRESHOLDS.HIGH_SEVERITY_DRIFT_PERCENT ? 'HIGH' : 'MEDIUM';
      const confidence = baselineVol > AUDIT_THRESHOLDS.HIGH_CONFIDENCE_VOLUME ? 'HIGH' : 'MEDIUM';

      return {
        organizationId: context.organizationId,
        workloadId: context.workloadId,
        category: this.id,
        severity,
        confidence,
        title: 'Disproportionate Cost Drift',
        description: `Unit cost per ${volumeMetric.replace('outcome_', 'outcome (')} ${volumeMetric.startsWith('outcome_') ? ')' : ''} increased by ${driftPercent}%.`,
        evidence: {
          metric: 'unit_cost_drift',
          baseline: parseFloat(baselineUnitCost.toFixed(4)),
          observed: parseFloat(currentUnitCost.toFixed(4)),
          changePercent: driftPercent,
          sampleSize: currentMetrics.requestCount,
          windowStart: currentWindow.start.toISOString(),
          windowEnd: currentWindow.end.toISOString(),
          details: { volumeMetric, baselineVolume: baselineVol, currentVolume: currentVol, baselineTotalCost: baselineMetrics.totalCost, currentTotalCost: currentMetrics.totalCost }
        },
        timeWindowStart: currentWindow.start,
        timeWindowEnd: currentWindow.end,
        status: 'OPEN'
      };
    }

    return null;
  }
}
