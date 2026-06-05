import { AuditRule, SubscriptionData, SeatUsage, ToolPricing, Recommendation } from '../types';
import { calculateSavings, formatCurrency } from '../utils/savings-math';

export class ApiArbitrageRule implements AuditRule {
  name = 'ApiArbitrageRule';

  // If users generate less than this many tokens, they are better off on an API plan.
  // Assuming $20/mo = ~1.3 million tokens of GPT-4o. If they use < 100k, they cost < $1.50/mo on API.
  private readonly LIGHT_USAGE_TOKEN_THRESHOLD = 100000;
  private readonly ESTIMATED_API_COST_PER_SEAT = 2; // $2/mo estimate for light API usage

  evaluate(subscriptions: SubscriptionData[], usageData: SeatUsage[], catalog: ToolPricing[]): Recommendation[] {
    const recommendations: Recommendation[] = [];

    for (const sub of subscriptions) {
      const tool = catalog.find(t => t.toolId === sub.toolId);
      // Only applies to standard consumer LLMs like ChatGPT or Claude
      if (!tool || tool.category !== 'llm' || tool.toolId.includes('api')) continue;

      const subUsage = usageData.filter(u => u.subscriptionId === sub.id);
      
      // Count light active users
      const lightActiveUsers = subUsage.filter(u => 
        u.lastActiveDaysAgo <= 30 && 
        u.tokensUsedMonthly !== undefined && 
        u.tokensUsedMonthly < this.LIGHT_USAGE_TOKEN_THRESHOLD
      ).length;

      if (lightActiveUsers > 0) {
        const { monthlySavings, annualSavings } = calculateSavings(
          lightActiveUsers, 
          sub.costPerSeat, 
          this.ESTIMATED_API_COST_PER_SEAT
        );
        
        // Suggest transitioning to API
        const apiToolId = tool.toolId === 'claude' ? 'anthropic-api' : 'openai-api';
        const apiTool = catalog.find(t => t.toolId === apiToolId);

        recommendations.push({
          id: `rule-api-arbitrage-${sub.id}`,
          type: 'SWITCH',
          toolId: sub.toolId,
          subscriptionId: sub.id,
          affectedSeats: lightActiveUsers,
          monthlySavings,
          annualSavings,
          confidenceScore: 80, // High ROI, but requires setting up LibreChat or similar
          suggestedAlternativeToolId: apiToolId,
          financeReasoning: `API Cheaper for Light Users: ${lightActiveUsers} employees on ${tool.name} use <100k tokens/mo. Moving them to an internal UI powered by ${apiTool?.name || 'API'} drops their average monthly cost from ${formatCurrency(sub.costPerSeat)} to ~${formatCurrency(this.ESTIMATED_API_COST_PER_SEAT)}. Annual savings: ${formatCurrency(annualSavings)}.`
        });
      }
    }

    return recommendations;
  }
}
