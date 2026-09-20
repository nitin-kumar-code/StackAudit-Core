import { PricingRecord, CanonicalUsageEvent } from '../types';

export interface CostCalculationResult {
  /** All costs are returned as decimal-safe strings */
  totalCost: string;
  inputCost: string;
  outputCost: string;
  cacheReadCost: string;
  cacheCreationCost: string;

  pricingRecordId?: string; // Optional if we are doing a hypothetical calculation without a DB record
  provider: string;
  model: string;
  calculatedAt: Date;
  
  /** Token breakdown for explainability */
  billableInputTokens: number;
  billableCacheReadTokens: number;
  billableCacheCreationTokens: number;
  billableOutputTokens: number;
}

export interface IPricingCatalog {
  findEffectivePrice(
    provider: string,
    model: string,
    timestamp: Date
  ): Promise<PricingRecord>;
}
