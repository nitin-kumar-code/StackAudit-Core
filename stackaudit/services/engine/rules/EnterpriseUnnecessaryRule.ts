import { AuditRule, SubscriptionData, SeatUsage, ToolPricing, Recommendation } from '../types';
import { calculateSavings, formatCurrency } from '../utils/savings-math';

export class EnterpriseUnnecessaryRule implements AuditRule {
  name = 'EnterpriseUnnecessaryRule';

  // Specific to tools where Enterprise provides organizational/repo features,
  // but usage logs show users only use standard features.
  // For this proxy, we check if they are on Copilot Enterprise or Cursor Business.
  
  evaluate(subscriptions: SubscriptionData[], usageData: SeatUsage[], catalog: ToolPricing[]): Recommendation[] {
    const recommendations: Recommendation[] = [];

    for (const sub of subscriptions) {
      const tool = catalog.find(t => t.toolId === sub.toolId);
      if (!tool) continue;

      const currentTier = tool.tiers.find(t => t.id === sub.tierId);
      if (!currentTier || (!currentTier.name.includes('Enterprise') && !currentTier.name.includes('Business'))) continue;

      // Find the cheaper Pro/Business tier
      const cheaperTier = tool.tiers
        .filter(t => t.pricePerSeat < currentTier.pricePerSeat)
        .sort((a, b) => b.pricePerSeat - a.pricePerSeat)[0]; 

      if (!cheaperTier) continue;

      const subUsage = usageData.filter(u => u.subscriptionId === sub.id);
      
      // Look for active seats that only use basic features.
      // In a real system, `u.tokensUsedMonthly` or `u.featuresUsed` would indicate if they use repo-context.
      // For this deterministic engine, if tokensUsedMonthly < 5000 (proxy for light usage on advanced features), flag it.
      const basicUsageSeats = subUsage.filter(u => 
        u.lastActiveDaysAgo <= 30 && 
        (u.tokensUsedMonthly === undefined || u.tokensUsedMonthly < 10000)
      ).length;

      if (basicUsageSeats > 0) {
        const { monthlySavings, annualSavings } = calculateSavings(
          basicUsageSeats, 
          sub.costPerSeat, 
          cheaperTier.pricePerSeat
        );
        
        recommendations.push({
          id: `rule-enterprise-unnecessary-${sub.id}`,
          type: 'DOWNGRADE',
          toolId: sub.toolId,
          subscriptionId: sub.id,
          affectedSeats: basicUsageSeats,
          monthlySavings,
          annualSavings,
          confidenceScore: 85,
          suggestedAlternativeTierId: cheaperTier.id,
          financeReasoning: `Enterprise Unnecessary: Detected ${basicUsageSeats} developers on ${tool.name} ${currentTier.name} utilizing only basic code completion. Downgrading these specific seats to ${cheaperTier.name} reduces licensing overhead by ${formatCurrency(monthlySavings)}/mo (${formatCurrency(annualSavings)}/yr).`
        });
      }
    }

    return recommendations;
  }
}
