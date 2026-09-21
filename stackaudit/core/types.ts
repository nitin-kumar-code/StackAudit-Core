export interface Provider { id: string; name: string; }
export interface TokenUsage { inputTokens: number; outputTokens: number; cacheReadTokens?: number; cacheCreationTokens?: number; requestCount?: number; }
export interface CanonicalUsageEvent { id: string; provider: string; model: string; timestamp: Date; usage: TokenUsage; attribution: { apiKeyId?: string; tags?: Record<string, string>; }; providerReference: string; rawResponseHash: string; capturedAt?: Date; isUnpriced?: boolean; }
export interface PricingRecord { id: string; provider: string; model: string; inputPrice: string; outputPrice: string; cacheReadPrice?: string; cacheCreationPrice?: string; effectiveFrom: Date; effectiveUntil?: Date; source: string; }
export interface Workload { id: string; organizationId: string; name: string; description?: string; createdAt: Date; }
export interface AttributionRule { id: string; organizationId: string; workloadId: string; provider: string; matchType: string; matchValue: string; createdAt: Date; }
export interface OutcomeEvent { id: string; organizationId: string; workloadId: string | null; outcomeType: string; timestamp: Date; count: number; metadata?: Record<string, any>; idempotencyKey?: string; }
export interface CostPerOutcomeResult { workloadId: string; outcomeType: string; startTime: Date; endTime: Date; totalCost: string; totalOutcomeCount: number; costPerOutcome: string | null; unpricedEventCount: number; currency: string; }
export interface CostPerOutcomeDataPoint { periodStart: Date; periodEnd: Date; totalCost: string; outcomeCount: number; costPerOutcome: string | null; unpricedEventCount: number; }
export type AuditCategory = 'USAGE_SPIKE' | 'COST_DRIFT' | 'TOKEN_EFFICIENCY' | 'MODEL_MIX' | 'RETRY_PATTERN';
export type Severity = 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH';
export type Confidence = 'LOW' | 'MEDIUM' | 'HIGH';
export interface AuditEvidence { metric: string; baseline?: number; observed?: number; changePercent?: number; sampleSize?: number; windowStart: string; windowEnd: string; supportingEventCount?: number; details?: Record<string, any>; }
export interface AuditFinding { id: string; organizationId: string; workloadId?: string | null; category: AuditCategory; severity: Severity; title: string; description: string; confidence: Confidence; evidence: AuditEvidence; timeWindowStart: Date; timeWindowEnd: Date; detectedAt: Date; status: string; }
export class ConflictError extends Error { constructor(message: string) { super(message); this.name = 'ConflictError'; } }
export class SkipError extends Error { constructor(message: string) { super(message); this.name = 'SkipError'; } }
