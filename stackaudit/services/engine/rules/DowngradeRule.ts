import { AuditRule, SubscriptionData, SeatUsage, ToolPricing, Recommendation } from '../types';
import { calculateSavings, formatCurrency } from '../utils/savings-math';

export class DowngradeRule implements AuditRule {
  name = 'DowngradeRule';

  // Specific token/usage thresholds that justify an Enterprise tier
  // If usage is below this, they can be downgraded to Pro/Standard
  private readonly ENTERPRISE_TOKEN_THRESHOLD = 50000;

  evaluate(subscriptions: SubscriptionData[], usageData: SeatUsage[], catalog: ToolPricing[]): Recommendation[] {
    const recommendations: Recommendation[] = [];

    for (const sub of subscriptions) {
      const tool = catalog.find(t => t.toolId === sub.toolId);
      if (!tool) continue;

      const currentTier = tool.tiers.find(t => t.id === sub.tierId);
      if (!currentTier) continue;

      // Look for a cheaper tier with the same billing cycle
      const cheaperTier = tool.tiers
        .filter(t => t.billingCycle === sub.billingCycle && t.pricePerSeat < currentTier.pricePerSeat)
        .sort((a, b) => b.pricePerSeat - a.pricePerSeat)[0]; // get the next highest tier below current

      if (!cheaperTier) continue;

      const subUsage = usageData.filter(u => u.subscriptionId === sub.id);
      
      // Count how many seats are active but use very few tokens (not utilizing enterprise limits)
      const overProvisionedSeats = subUsage.filter(u => 
        u.lastActiveDaysAgo <= 30 && // they are active (otherwise UnusedSeatRule catches them)
        (u.tokensUsedMonthly || 0) < this.ENTERPRISE_TOKEN_THRESHOLD
      ).length;

      if (overProvisionedSeats > 0) {
        const { monthlySavings, annualSavings } = calculateSavings(
          overProvisionedSeats, 
          sub.costPerSeat, 
          cheaperTier.pricePerSeat
        );
        
        recommendations.push({
          id: `rule-downgrade-${sub.id}`,
          type: 'DOWNGRADE',
          toolId: sub.toolId,
          subscriptionId: sub.id,
          affectedSeats: overProvisionedSeats,
          monthlySavings,
          annualSavings,
          // 90% confidence - they are using it, but not enough to justify the higher tier
          confidenceScore: 90,
          suggestedAlternativeTierId: cheaperTier.id,
          financeReasoning: `Detected ${overProvisionedSeats} seats on ${tool.name} ${currentTier.name} utilizing <${this.ENTERPRISE_TOKEN_THRESHOLD} tokens/mo. Downgrading these light-usage seats to ${cheaperTier.name} optimizes spend by ${formatCurrency(monthlySavings)}/mo (${formatCurrency(annualSavings)}/yr) while preserving necessary capabilities.`
        });
      }
    }

    return recommendations;
  }
}
