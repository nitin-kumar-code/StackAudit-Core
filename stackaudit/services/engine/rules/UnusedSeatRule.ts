import { AuditRule, SubscriptionData, SeatUsage, ToolPricing, Recommendation } from '../types';
import { calculateSavings, formatCurrency } from '../utils/savings-math';

export class UnusedSeatRule implements AuditRule {
  name = 'UnusedSeatRule';

  // Number of days without activity to consider a seat "unused"
  private readonly STALE_THRESHOLD_DAYS = 30;

  evaluate(subscriptions: SubscriptionData[], usageData: SeatUsage[], catalog: ToolPricing[]): Recommendation[] {
    const recommendations: Recommendation[] = [];

    for (const sub of subscriptions) {
      // Find all usage records for this subscription
      const subUsage = usageData.filter(u => u.subscriptionId === sub.id);
      
      // Count seats that haven't been active recently
      const unusedSeats = subUsage.filter(u => u.lastActiveDaysAgo > this.STALE_THRESHOLD_DAYS).length;

      if (unusedSeats > 0) {
        const { monthlySavings, annualSavings } = calculateSavings(unusedSeats, sub.costPerSeat, 0);
        
        // Find tool name from catalog
        const tool = catalog.find(t => t.toolId === sub.toolId);
        const toolName = tool ? tool.name : sub.toolId;

        recommendations.push({
          id: `rule-unused-${sub.id}`,
          type: 'CANCEL',
          toolId: sub.toolId,
          subscriptionId: sub.id,
          affectedSeats: unusedSeats,
          monthlySavings,
          annualSavings,
          // 100% confidence because 0 usage is a deterministic, measurable fact
          confidenceScore: 100,
          financeReasoning: `Audited ${sub.seats} provisioned seats for ${toolName}. Discovered ${unusedSeats} stale seats (0 usage in >${this.STALE_THRESHOLD_DAYS} days). Revoking these seats instantly decreases run-rate by ${formatCurrency(monthlySavings)}/month, representing an annualized ROI impact of ${formatCurrency(annualSavings)}.`
        });
      }
    }

    return recommendations;
  }
}
