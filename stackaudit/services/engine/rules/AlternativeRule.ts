import { AuditRule, SubscriptionData, SeatUsage, ToolPricing, Recommendation } from '../types';
import { calculateSavings, formatCurrency } from '../utils/savings-math';

export class AlternativeRule implements AuditRule {
  name = 'AlternativeRule';

  evaluate(subscriptions: SubscriptionData[], usageData: SeatUsage[], catalog: ToolPricing[]): Recommendation[] {
    const recommendations: Recommendation[] = [];

    for (const sub of subscriptions) {
      const tool = catalog.find(t => t.toolId === sub.toolId);
      if (!tool || tool.alternatives.length === 0) continue;

      // Find if there's a cheaper alternative tool in the catalog
      let bestAlternative: ToolPricing | null = null;
      let cheapestAltPrice = sub.costPerSeat;

      for (const altId of tool.alternatives) {
        const altTool = catalog.find(t => t.toolId === altId);
        if (!altTool) continue;

        // Find the equivalent tier (assume basic standard tier for comparison)
        const altTier = altTool.tiers.find(t => t.billingCycle === sub.billingCycle);
        if (altTier && altTier.pricePerSeat < cheapestAltPrice) {
          cheapestAltPrice = altTier.pricePerSeat;
          bestAlternative = altTool;
        }
      }

      if (bestAlternative) {
        const subUsage = usageData.filter(u => u.subscriptionId === sub.id);
        const activeSeats = subUsage.filter(u => u.lastActiveDaysAgo <= 30).length;

        if (activeSeats > 0) {
          const { monthlySavings, annualSavings } = calculateSavings(
            activeSeats, 
            sub.costPerSeat, 
            cheapestAltPrice
          );
          
          recommendations.push({
            id: `rule-alternative-${sub.id}`,
            type: 'SWITCH',
            toolId: sub.toolId,
            subscriptionId: sub.id,
            affectedSeats: activeSeats,
            monthlySavings,
            annualSavings,
            // 60% confidence - switching tools has organizational friction
            confidenceScore: 60,
            suggestedAlternativeToolId: bestAlternative.toolId,
            financeReasoning: `Strategic arbitrage opportunity: Migrating ${activeSeats} active seats from ${tool.name} to ${bestAlternative.name} reduces per-seat licensing from ${formatCurrency(sub.costPerSeat)} to ${formatCurrency(cheapestAltPrice)}. This consolidation captures ${formatCurrency(annualSavings)} in annualized savings.`
          });
        }
      }
    }

    return recommendations;
  }
}
