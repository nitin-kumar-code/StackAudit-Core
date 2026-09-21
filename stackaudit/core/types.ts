export interface Provider {
  id: string;
  name: string;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
}

export interface CanonicalUsageEvent {
  id: string;
  provider: string;
  model: string;
  timestamp: Date;
  usage: TokenUsage;
  attribution: {
    apiKeyId?: string;
    tags?: Record<string, string>;
  };
  providerReference: string;
  rawResponseHash: string;
  capturedAt?: Date;
}

export interface PricingRecord {
  id: string;
  provider: string;
  model: string;
  inputPrice: string;
  outputPrice: string;
  cacheReadPrice?: string;
  cacheCreationPrice?: string;
  effectiveFrom: Date;
  effectiveUntil?: Date;
  source: string;
}

export interface Workload {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  createdAt: Date;
}

export interface AttributionRule {
  id: string;
  organizationId: string;
  workloadId: string;
  provider: string;
  matchType: string;
  matchValue: string;
  createdAt: Date;
}

export interface OutcomeEvent {
  id: string;
  organizationId: string;
  workloadId: string | null;
  outcomeType: string;
  timestamp: Date;
  count: number;
  metadata?: Record<string, any>;
  idempotencyKey?: string;
}

export interface CostPerOutcomeResult {
  workloadId: string;
  outcomeType: string;
  startTime: Date;
  endTime: Date;

  totalCost: string;
  totalOutcomeCount: number;
  costPerOutcome: string | null;
  unpricedEventCount: number;
  
  // V0 default is USD
  currency: string;
}

export interface CostPerOutcomeDataPoint {
  periodStart: Date;
  periodEnd: Date;
  totalCost: string;
  outcomeCount: number;
  costPerOutcome: string | null;
  unpricedEventCount: number;
}

export interface AuditFinding {
  id: string;
  workloadId?: string;
  category: string;
  finding: string;
  confidence: 'high' | 'medium' | 'low';
  evidence: Record<string, any>;
  timestamp: Date;
}

export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}
