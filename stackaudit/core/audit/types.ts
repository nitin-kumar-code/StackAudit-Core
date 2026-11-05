import { AuditFinding, AuditCategory } from '../types';

export interface TimeWindow {
  start: Date;
  end: Date;
}

export interface MetricSummary {
  /** Known priced subtotal; null when every event in the window is unpriced. */
  totalCost: number | null;
  totalTokens: number;
  requestCount: number;
  unpricedEvents: number; // Added for data quality checks
  models?: Record<string, { cost: number | null; tokens: number; requests: number }>;
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
