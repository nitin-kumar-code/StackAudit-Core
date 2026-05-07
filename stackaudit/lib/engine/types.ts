import { AuditFormData } from '../validations/audit';

export type RecommendationType = 
  | 'downgrade'         // Move to a cheaper plan of the same tool
  | 'consolidation'     // Remove overlapping tools
  | 'alternative'       // Switch to a cheaper competitor
  | 'annual_commitment' // Switch from monthly to annual billing
  | 'overpayment'       // Catch math errors / overpaying compared to list price
  | 'negotiation';      // Recommendation to negotiate for large seats

export interface Recommendation {
  id: string;
  type: RecommendationType;
  tool: string;
  title: string;
  description: string;
  monthlySavings: number;
  annualSavings: number;
  confidenceScore: number; // 0 to 100
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

// Ensure the engine inputs matches the schema from validation
export type EngineInput = AuditFormData;
