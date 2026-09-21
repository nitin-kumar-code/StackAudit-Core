import { AuditContext, AuditRule } from './types';
import { AuditFinding } from '../types';

export class AuditEngine {
  constructor(private rules: AuditRule[]) {}

  evaluate(context: AuditContext): Omit<AuditFinding, 'id' | 'detectedAt'>[] {
    const findings: Omit<AuditFinding, 'id' | 'detectedAt'>[] = [];

    for (const rule of this.rules) {
      try {
        const finding = rule.evaluate(context);
        if (finding) {
          findings.push(finding);
        }
      } catch (error) {
        console.error(`Rule ${rule.id} failed to evaluate:`, error);
      }
    }

    return findings;
  }
}
