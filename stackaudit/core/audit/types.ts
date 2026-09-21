import { AuditFinding, AuditCategory, Severity, Confidence, AuditEvidence } from '../types';

export interface TimeWindow {
  start: Date;
  end: Date;
}

export interface MetricSummary {
  totalCost: number;
  totalTokens: number;
  requestCount: number;
  unpricedEvents: number; // Added for data quality checks
  models?: Record<string, { cost: number; tokens: number; requests: number }>;
}

export interface AuditContext {
  organizationId: string;
  workloadId: string;
  currentWindow: TimeWindow;
  baselineWindow: TimeWindow;
  currentMetrics: MetricSummary;
  baselineMetrics: MetricSummary;
  currentOutcomes?: Record<string, number>;
  baselineOutcomes?: Record<string, number>;
}

export interface AuditRule {
  id: AuditCategory;
  evaluate(context: AuditContext): Omit<AuditFinding, 'id' | 'detectedAt'> | null;
}
