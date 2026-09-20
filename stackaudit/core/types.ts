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
    workloadId?: string;
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
  workloadId: string;
  ruleType: string;
  ruleValue: string;
  createdAt: Date;
}

export interface OutcomeEvent {
  id: string;
  workloadId: string;
  outcomeType: string;
  timestamp: Date;
  count: number;
  metadata?: Record<string, any>;
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
