export type BillingCycle = 'monthly' | 'annual';
export type ToolCategory = 'llm' | 'coding-assistant' | 'image-gen' | 'video-gen';
export type RecommendationType = 'CANCEL' | 'DOWNGRADE' | 'SWITCH' | 'ANNUAL_COMMIT';

export interface PricingTier {
  id: string;
  name: string;
  billingCycle: BillingCycle;
  pricePerSeat: number;
  features: string[];
}

export interface ToolPricing {
  toolId: string;
  name: string;
  category: ToolCategory;
  tiers: PricingTier[];
  alternatives: string[];
}

export interface SubscriptionData {
  id: string;
  toolId: string;
  tierId: string;
  seats: number;
  billingCycle: BillingCycle;
  costPerSeat: number;
}

export interface SeatUsage {
  seatId: string;
  subscriptionId: string;
  lastActiveDaysAgo: number;
  tokensUsedMonthly?: number;
}

export interface Recommendation {
  id: string;
  type: RecommendationType;
  toolId: string;
  subscriptionId: string;
  affectedSeats: number;
  monthlySavings: number;
  annualSavings: number;
  confidenceScore: number;
  financeReasoning: string;
  suggestedAlternativeToolId?: string;
  suggestedAlternativeTierId?: string;
}

export interface EngineResult {
  currentMonthlySpend: number;
  currentAnnualSpend: number;
  optimizedMonthlySpend: number;
  optimizedAnnualSpend: number;
  totalMonthlySavings: number;
  totalAnnualSavings: number;
  recommendations: Recommendation[];
}

export interface AuditRule {
  name: string;
  evaluate(subscriptions: SubscriptionData[], usageData: SeatUsage[], catalog: ToolPricing[]): Recommendation[];
}
