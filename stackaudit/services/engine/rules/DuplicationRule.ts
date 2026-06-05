import { AuditRule, SubscriptionData, SeatUsage, ToolPricing, Recommendation } from '../types';
import { calculateSavings, formatCurrency } from '../utils/savings-math';

export class DuplicationRule implements AuditRule {
  name = 'DuplicationRule';

  evaluate(subscriptions: SubscriptionData[], usageData: SeatUsage[], catalog: ToolPricing[]): Recommendation[] {
    const recommendations: Recommendation[] = [];

    // Group subscriptions by category
    const categories = new Map<string, SubscriptionData[]>();
    for (const sub of subscriptions) {
      const tool = catalog.find(t => t.toolId === sub.toolId);
      if (tool) {
        const existing = categories.get(tool.category) || [];
        existing.push(sub);
        categories.set(tool.category, existing);
      }
    }

    for (const [category, subs] of categories.entries()) {
      // If an organization has more than one tool in the same category
      if (subs.length > 1) {
        // Find total seats provisioned across the category
        let totalCategorySeats = 0;
        let totalMonthlySpend = 0;
        
        subs.forEach(sub => {
          totalCategorySeats += sub.seats;
          totalMonthlySpend += (sub.seats * sub.costPerSeat);
        });

        // Heuristic: If we assume a realistic startup has overlapping seats, 
        // we recommend consolidating to the tool with the most active usage.
        
        let mostActiveSub = subs[0];
        let maxActiveSeats = 0;

        subs.forEach(sub => {
          const activeSeats = usageData.filter(u => u.subscriptionId === sub.id && u.lastActiveDaysAgo <= 30).length;
          if (activeSeats > maxActiveSeats) {
            maxActiveSeats = activeSeats;
            mostActiveSub = sub;
          }
        });

        // The tools to cancel are the ones that are NOT the most active one
        const subsToCancel = subs.filter(s => s.id !== mostActiveSub.id);

        for (const subToCancel of subsToCancel) {
          const toolName = catalog.find(t => t.toolId === subToCancel.toolId)?.name || subToCancel.toolId;
          const primaryToolName = catalog.find(t => t.toolId === mostActiveSub.toolId)?.name || mostActiveSub.toolId;
          
          const { monthlySavings, annualSavings } = calculateSavings(subToCancel.seats, subToCancel.costPerSeat, 0);

          if (monthlySavings > 0) {
            recommendations.push({
              id: `rule-duplication-${subToCancel.id}`,
              type: 'CANCEL',
              toolId: subToCancel.toolId,
              subscriptionId: subToCancel.id,
              affectedSeats: subToCancel.seats,
              monthlySavings,
              annualSavings,
              confidenceScore: 75, // 75% because some teams genuinely need multiple LLMs, but it's a strong optimization target
              financeReasoning: `Duplicated Tooling Waste: Detected overlapping subscriptions in the '${category}' category. The team relies heavily on ${primaryToolName}, but is also paying for ${subToCancel.seats} seats of ${toolName}. Consolidating onto ${primaryToolName} eliminates redundancy and recovers ${formatCurrency(monthlySavings)}/mo (${formatCurrency(annualSavings)}/yr).`
            });
          }
        }
      }
    }

    return recommendations;
  }
}
