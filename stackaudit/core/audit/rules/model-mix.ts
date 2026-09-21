import { AuditRule, AuditContext } from '../types';
import { AuditFinding } from '../../types';
import { AUDIT_THRESHOLDS } from '../thresholds';

export class ModelMixRule implements AuditRule {
  id = 'MODEL_MIX' as const;

  evaluate(context: AuditContext): Omit<AuditFinding, 'id' | 'detectedAt'> | null {
    const { currentMetrics, baselineMetrics, currentWindow } = context;

    if (!currentMetrics.models || !baselineMetrics.models) return null;
    if (baselineMetrics.requestCount === 0 || currentMetrics.requestCount < AUDIT_THRESHOLDS.MIN_SAMPLE_SIZE) return null;

    let maxShift = 0;
    let shiftDetails = '';
    
    // Check for significant shifts in request share
    const allModels = new Set([...Object.keys(currentMetrics.models), ...Object.keys(baselineMetrics.models)]);
    
    for (const model of allModels) {
      const baselineShare = (baselineMetrics.models[model]?.requests || 0) / baselineMetrics.requestCount;
      const currentShare = (currentMetrics.models[model]?.requests || 0) / currentMetrics.requestCount;
      
      const shift = Math.abs(currentShare - baselineShare);
      if (shift > maxShift && shift > AUDIT_THRESHOLDS.MODEL_MIX_SHIFT_PERCENT) {
        maxShift = shift;
        shiftDetails = `Model '${model}' share shifted from ${(baselineShare * 100).toFixed(1)}% to ${(currentShare * 100).toFixed(1)}%.`;
      }
    }

    if (maxShift > AUDIT_THRESHOLDS.MODEL_MIX_SHIFT_PERCENT) {
      return {
        organizationId: context.organizationId,
        workloadId: context.workloadId,
        category: this.id,
        severity: 'INFO', // Model shifts are informative, not necessarily bad
        confidence: 'HIGH',
        title: 'Significant Model Mix Shift',
        description: `The distribution of models used by this workload has changed significantly. ${shiftDetails}`,
        evidence: {
          metric: 'model_share_shift',
          observed: parseFloat((maxShift * 100).toFixed(2)),
          changePercent: parseFloat((maxShift * 100).toFixed(2)),
          sampleSize: currentMetrics.requestCount,
          windowStart: currentWindow.start.toISOString(),
          windowEnd: currentWindow.end.toISOString(),
          details: { shiftDetails }
        },
        timeWindowStart: currentWindow.start,
        timeWindowEnd: currentWindow.end
      };
    }

    return null;
  }
}
