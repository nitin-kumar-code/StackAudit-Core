import { SubscriptionData, SeatUsage, ToolPricing, EngineResult, AuditRule } from './types';
import { PRICING_CATALOG } from './data/pricing-catalog';
import { UnusedSeatRule } from './rules/UnusedSeatRule';
import { AnnualCommitRule } from './rules/AnnualCommitRule';
import { AlternativeRule } from './rules/AlternativeRule';
import { DuplicationRule } from './rules/DuplicationRule';
import { TeamPlanOverkillRule } from './rules/TeamPlanOverkillRule';
import { EnterpriseUnnecessaryRule } from './rules/EnterpriseUnnecessaryRule';
import { ApiArbitrageRule } from './rules/ApiArbitrageRule';

export class AuditEngine {
  private rules: AuditRule[];
  private catalog: ToolPricing[];

  constructor(customCatalog?: ToolPricing[]) {
    // Inject the deterministic pricing catalog
    this.catalog = customCatalog || PRICING_CATALOG;
    
    // Initialize the rule pipeline
    this.rules = [
      new UnusedSeatRule(),
      new EnterpriseUnnecessaryRule(),
      new AnnualCommitRule(),
      new TeamPlanOverkillRule(),
      new DuplicationRule(),
      new ApiArbitrageRule(),
      new AlternativeRule(),
    ];
  }

  public runAudit(subscriptions: SubscriptionData[], usageData: SeatUsage[]): EngineResult {
    let currentMonthlySpend = 0;
    let currentAnnualSpend = 0;
    
    for (const sub of subscriptions) {
      if (sub.billingCycle === 'monthly') {
        currentMonthlySpend += sub.seats * sub.costPerSeat;
        currentAnnualSpend += sub.seats * sub.costPerSeat * 12;
      } else {
        currentMonthlySpend += (sub.seats * sub.costPerSeat) / 12;
        currentAnnualSpend += sub.seats * sub.costPerSeat;
      }
    }

    const allRecommendations = [];
    
    // Process each rule independently
    for (const rule of this.rules) {
      const recommendations = rule.evaluate(subscriptions, usageData, this.catalog);
      allRecommendations.push(...recommendations);
    }

    // Sort by highest confidence and then highest annual savings
    allRecommendations.sort((a, b) => {
      if (b.confidenceScore !== a.confidenceScore) {
        return b.confidenceScore - a.confidenceScore;
      }
      return b.annualSavings - a.annualSavings;
    });

    // Aggregate totals
    const totalMonthlySavings = allRecommendations.reduce((sum, rec) => sum + rec.monthlySavings, 0);
    const totalAnnualSavings = allRecommendations.reduce((sum, rec) => sum + rec.annualSavings, 0);

    return {
      currentMonthlySpend,
      currentAnnualSpend,
      optimizedMonthlySpend: currentMonthlySpend - totalMonthlySavings,
      optimizedAnnualSpend: currentAnnualSpend - totalAnnualSavings,
      totalMonthlySavings,
      totalAnnualSavings,
      recommendations: allRecommendations
    };
  }
}
