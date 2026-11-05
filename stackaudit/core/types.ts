export interface Provider { id: string; name: string; }
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = Record<string, JsonValue>;
export interface TokenUsage { inputTokens: number; outputTokens: number; cacheReadTokens?: number; cacheCreationTokens?: number; requestCount?: number; }
export interface CanonicalUsageEvent { id: string; provider: string; model: string; timestamp: Date; usage: TokenUsage; attribution: { apiKeyId?: string; tags?: Record<string, string>; }; providerReference: string; rawResponseHash: string; capturedAt?: Date; isUnpriced?: boolean; }
export interface PricingRecord { id: string; provider: string; model: string; inputPrice: string; outputPrice: string; cacheReadPrice?: string; cacheCreationPrice?: string; effectiveFrom: Date; effectiveUntil?: Date; source: string; }
export interface Workload { id: string; organizationId: string; name: string; description?: string; createdAt: Date; }
export interface AttributionRule { id: string; organizationId: string; workloadId: string; provider: string; matchType: string; matchValue: string; createdAt: Date; }
export interface OutcomeEvent { id: string; organizationId: string; workloadId: string | null; outcomeType: string; timestamp: Date; count: number; metadata?: JsonObject; idempotencyKey?: string; }
export interface CostPerOutcomeResult {
  workloadId: string;
  outcomeType: string;
  startTime: Date;
  endTime: Date;
  /** Authoritative total; null if any usage in this workload/window is unpriced. */
  totalCost: string | null;
  /** Decimal-safe subtotal for priced usage. Null when no events were priced. */
  knownCost: string | null;
  isCostComplete: boolean;
  pricedEventCount: number;
  totalOutcomeCount: number;
  costPerOutcome: string | null; // Null when count is zero, pricing is incomplete, or cost cannot be scoped to one outcome type.
  unpricedEventCount: number;
  availabilityReason: string | null;
  currency: string;
  costAllocationNote?: string;
}
export interface CostPerOutcomeDataPoint {
  periodStart: Date;
  periodEnd: Date;
  totalCost: string | null;
  knownCost: string | null;
  isCostComplete: boolean;
  pricedEventCount: number;
  outcomeCount: number;
  costPerOutcome: string | null;
  unpricedEventCount: number;
  availabilityReason: string | null;
}
export type AuditCategory = 'USAGE_SPIKE' | 'COST_DRIFT' | 'TOKEN_EFFICIENCY' | 'MODEL_MIX' | 'RETRY_PATTERN';
export type Severity = 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH';
export type Confidence = 'LOW' | 'MEDIUM' | 'HIGH';
export interface AuditEvidence { metric: string; baseline?: number; observed?: number; changePercent?: number; sampleSize?: number; windowStart: string; windowEnd: string; supportingEventCount?: number; details?: JsonObject; }
export interface AuditFinding { id: string; organizationId: string; workloadId?: string | null; category: AuditCategory; severity: Severity; title: string; description: string; confidence: Confidence; evidence: AuditEvidence; timeWindowStart: Date; timeWindowEnd: Date; detectedAt: Date; status: string; }
export class ConflictError extends Error { constructor(message: string) { super(message); this.name = 'ConflictError'; } }
export class SkipError extends Error { constructor(message: string) { super(message); this.name = 'SkipError'; } }

// Phase 8 Monitoring
export interface MonitoringConfig {
  id: string;
  organizationId: string;
  workloadId?: string | null;
  enabled: boolean;
  config: {
    evaluationWindowDays: number;
    notificationChannels: Array<{
      type: 'webhook';
      url: string;
      secret?: string;
    }>;
    alertPolicy: {
      minSeverityToNotify: Severity;
    };
  };
  createdAt: Date;
  updatedAt: Date;
}

export type AlertStatus = 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED';

export interface Alert {
  id: string;
  organizationId: string;
  workloadId?: string | null;
  findingId?: string | null;
  category: AuditCategory;
  severity: Severity;
  status: AlertStatus;
  fingerprint: string;
  notifiedAt?: Date;
  lastNotifiedSeverity?: Severity | null;
  notificationAttempts: number;
  lastNotificationError?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type MonitoringRunStatus = 'RUNNING' | 'COMPLETED' | 'COMPLETED_WITH_ERRORS' | 'FAILED' | 'TIMED_OUT';

export interface MonitoringRun {
  id: string;
  organizationId: string;
  startedAt: Date;
  completedAt?: Date;
  status: MonitoringRunStatus;
  evaluatedWorkloads: number;
  findingsCount: number;
  alertsCount: number;
  errorInfo?: string;
}
