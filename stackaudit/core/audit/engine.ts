import { AuditContext, AuditRule } from './types';
import { AuditFinding, SkipError } from '../types';

export interface AuditEngineResult {
  findings: Omit<AuditFinding, 'id' | 'detectedAt'>[];
  rulesEvaluated: string[];
  rulesSkipped: { ruleId: string; reason: string }[];
}

export class AuditEngine {
  constructor(private rules: AuditRule[]) {}

  evaluate(context: AuditContext): AuditEngineResult {
    const findings: Omit<AuditFinding, 'id' | 'detectedAt'>[] = [];
    const rulesEvaluated: string[] = [];
    const rulesSkipped: { ruleId: string; reason: string }[] = [];

    for (const rule of this.rules) {
      try {
        const finding = rule.evaluate(context);
        if (finding) {
          findings.push(finding);
        }
        rulesEvaluated.push(rule.id);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        if (error instanceof SkipError || message.startsWith('Skipped:')) {
          rulesSkipped.push({ ruleId: rule.id, reason: message });
        } else {
          console.error(`Rule ${rule.id} failed to evaluate:`, error);
          rulesSkipped.push({ ruleId: rule.id, reason: 'Failed to evaluate due to unexpected error' });
        }
      }
    }

    return { findings, rulesEvaluated, rulesSkipped };
  }
}
