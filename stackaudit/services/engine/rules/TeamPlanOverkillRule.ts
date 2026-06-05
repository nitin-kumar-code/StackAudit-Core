import { AuditRule, SubscriptionData, SeatUsage, ToolPricing, Recommendation } from '../types';
import { calculateSavings, formatCurrency } from '../utils/savings-math';

export class TeamPlanOverkillRule implements AuditRule {
  name = 'TeamPlanOverkillRule';

  // If active usage is very low (e.g. only 1 or 2 users really using it)
  // Team plans often enforce a minimum of 2 or 5 seats, leading to artificial bloat.
  private readonly TEAM_SEAT_OVERKILL_THRESHOLD = 3;

  evaluate(subscriptions: SubscriptionData[], usageData: SeatUsage[], catalog: ToolPricing[]): Recommendation[] {
    const recommendations: Recommendation[] = [];

    for (const sub of subscriptions) {
      const tool = catalog.find(t => t.toolId === sub.toolId);
      if (!tool) continue;

      const currentTier = tool.tiers.find(t => t.id === sub.tierId);
      if (!currentTier || !currentTier.name.includes('Team')) continue;

      // Find an individual plan equivalent (usually named 'Plus' or 'Pro')
      const individualTier = tool.tiers.find(t => t.name.includes('Pro') || t.name.includes('Plus') || t.name === 'Cursor Pro' || t.name === 'ChatGPT Plus');
      
      if (!individualTier) continue;

      const subUsage = usageData.filter(u => u.subscriptionId === sub.id);
      const activeSeats = subUsage.filter(u => u.lastActiveDaysAgo <= 30).length;

      // If they are paying for a Team plan (which forces minimum seats) but only have a few active users
      // AND downgrading those active users to Individual plans is cheaper than the entire Team contract.
      if (activeSeats > 0 && activeSeats <= this.TEAM_SEAT_OVERKILL_THRESHOLD) {
        
        const currentTotalCost = sub.seats * sub.costPerSeat;
        const proposedTotalCost = activeSeats * individualTier.pricePerSeat;

        if (proposedTotalCost < currentTotalCost) {
          const monthlySavings = currentTotalCost - proposedTotalCost;
          const annualSavings = monthlySavings * 12;

          recommendations.push({
            id: `rule-team-overkill-${sub.id}`,
            type: 'DOWNGRADE',
            toolId: sub.toolId,
            subscriptionId: sub.id,
            affectedSeats: sub.seats, // The whole subscription is affected
            monthlySavings,
            annualSavings,
            confidenceScore: 90,
            suggestedAlternativeTierId: individualTier.id,
            financeReasoning: `Team Plan Overkill: Paying for ${sub.seats} seats on ${tool.name} ${currentTier.name} (${formatCurrency(currentTotalCost)}/mo) when only ${activeSeats} users are active. Reverting these power-users to individual ${individualTier.name} licenses (${formatCurrency(proposedTotalCost)}/mo) saves ${formatCurrency(annualSavings)} annually without losing core capabilities.`
          });
        }
      }
    }

    return recommendations;
  }
}
