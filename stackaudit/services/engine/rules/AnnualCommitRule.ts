import { AuditRule, SubscriptionData, SeatUsage, ToolPricing, Recommendation } from '../types';
import { calculateSavings, formatCurrency } from '../utils/savings-math';

export class AnnualCommitRule implements AuditRule {
  name = 'AnnualCommitRule';

  // Number of days of consistent usage required to recommend an annual commit
  private readonly CONSISTENCY_THRESHOLD_DAYS = 90;

  evaluate(subscriptions: SubscriptionData[], usageData: SeatUsage[], catalog: ToolPricing[]): Recommendation[] {
    const recommendations: Recommendation[] = [];

    for (const sub of subscriptions) {
      // Only evaluate monthly subscriptions
      if (sub.billingCycle !== 'monthly') continue;

      const tool = catalog.find(t => t.toolId === sub.toolId);
      if (!tool) continue;

      // Find the annual tier that corresponds to the same feature set
      // For simplicity, we assume same name but different billing cycle
      const annualTier = tool.tiers.find(
        tier => tier.name === tool.tiers.find(t => t.id === sub.tierId)?.name && tier.billingCycle === 'annual'
      );

      if (!annualTier || annualTier.pricePerSeat >= sub.costPerSeat) continue;

      // Find usage records for this subscription
      const subUsage = usageData.filter(u => u.subscriptionId === sub.id);
      
      // Count seats that are highly active (acting as a proxy for 'consistent' in this simple model)
      // In a real app, we'd check historical monthly active days
      const consistentlyActiveSeats = subUsage.filter(u => u.lastActiveDaysAgo <= 7).length;

      // Only recommend if a significant portion of seats are active (e.g. at least 1)
      if (consistentlyActiveSeats > 0) {
        const { monthlySavings, annualSavings } = calculateSavings(
          consistentlyActiveSeats, 
          sub.costPerSeat, 
          annualTier.pricePerSeat
        );
        
        recommendations.push({
          id: `rule-annual-${sub.id}`,
          type: 'ANNUAL_COMMIT',
          toolId: sub.toolId,
          subscriptionId: sub.id,
          affectedSeats: consistentlyActiveSeats,
          monthlySavings,
          annualSavings,
          // 85% confidence because future usage isn't guaranteed, despite past consistency
          confidenceScore: 85,
          suggestedAlternativeTierId: annualTier.id,
          financeReasoning: `Identified ${consistentlyActiveSeats} highly active seats on ${tool.name} (Monthly). Switching these stable seats to an Annual commit at ${formatCurrency(annualTier.pricePerSeat)}/mo yields a cost reduction of ${formatCurrency(monthlySavings)}/mo, saving ${formatCurrency(annualSavings)} annually without impacting workflows.`
        });
      }
    }

    return recommendations;
  }
}
