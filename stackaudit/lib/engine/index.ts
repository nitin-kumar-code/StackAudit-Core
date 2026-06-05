import { EngineInput, EngineResult, Recommendation, RecommendationType } from './types';
import { TOOL_PRICING, ToolData } from './pricing';

/**
 * Normalizes a plan name to match against our pricing constants.
 */
function normalizePlanName(plan: string): string {
  return plan.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Finds the closest matching plan in our database.
 */
function findMatchingPlan(toolData: ToolData, planName: string) {
  const normalizedInput = normalizePlanName(planName);
  
  // Direct ID match
  if (toolData.plans[normalizedInput]) {
    return toolData.plans[normalizedInput];
  }
  
  // Value match
  for (const plan of Object.values(toolData.plans)) {
    if (normalizePlanName(plan.name) === normalizedInput || normalizedInput.includes(normalizePlanName(plan.name))) {
      return plan;
    }
  }
  
  return null;
}

export function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

export function analyzeAudit(input: EngineInput): EngineResult {
  let currentMonthlySpend = 0;
  const recommendations: Recommendation[] = [];
  
  const toolsByCategory: Record<string, Array<{name: string, spend: number, seats: number}>> = {
    coding: [],
    chat: [],
    api: [],
    other: []
  };

  // 1. Initial Processing & Current Spend Calculation
  for (const [toolName, details] of Object.entries(input.toolDetails)) {
    currentMonthlySpend += details.monthlySpend;
    
    const toolData = TOOL_PRICING[toolName];
    if (toolData) {
      toolsByCategory[toolData.category].push({
        name: toolName,
        spend: details.monthlySpend,
        seats: details.seats
      });
    }
  }

  // 2. Rule: Overpayment Detection (List price mismatch)
  for (const [toolName, details] of Object.entries(input.toolDetails)) {
    const toolData = TOOL_PRICING[toolName];
    if (!toolData) continue;

    const matchedPlan = findMatchingPlan(toolData, details.plan);
    if (matchedPlan) {
      const expectedMonthly = matchedPlan.pricePerSeatMonthly * details.seats;
      const expectedAnnual = (matchedPlan.pricePerSeatAnnual || matchedPlan.pricePerSeatMonthly) * details.seats;

      // Check if they are paying significantly more than the monthly list price
      if (details.monthlySpend > expectedMonthly && expectedMonthly > 0) {
        const overpayment = details.monthlySpend - expectedMonthly;
        recommendations.push({
          id: generateId(),
          type: 'overpayment',
          tool: toolName,
          title: `Overpaying for ${toolName} ${matchedPlan.name} Plan`,
          description: `You are spending $${details.monthlySpend}/mo for ${details.seats} seats, but the standard list price is $${expectedMonthly}/mo. You should audit your invoice for hidden fees or unutilized add-ons.`,
          monthlySavings: overpayment,
          annualSavings: overpayment * 12,
          confidenceScore: 90
        });
      }

      // 3. Rule: Annual Commitment Savings
      // If they are paying exactly the monthly rate, recommend annual
      if (
        matchedPlan.pricePerSeatAnnual && 
        matchedPlan.pricePerSeatAnnual < matchedPlan.pricePerSeatMonthly &&
        Math.abs(details.monthlySpend - expectedMonthly) < 5 // Allow small margin
      ) {
        const monthlySavings = (matchedPlan.pricePerSeatMonthly - matchedPlan.pricePerSeatAnnual) * details.seats;
        recommendations.push({
          id: generateId(),
          type: 'annual-billing' as RecommendationType,
          tool: toolName,
          title: `Switch to Annual Billing for ${toolName}`,
          description: `Switching from monthly to annual billing for ${details.seats} seats can reduce your per-seat cost from $${matchedPlan.pricePerSeatMonthly} to $${matchedPlan.pricePerSeatAnnual}.`,
          monthlySavings: monthlySavings,
          annualSavings: monthlySavings * 12,
          confidenceScore: 95
        });
      }
    }
  }

  // 4. Rule: Tool Consolidation (Redundancy)
  for (const [category, tools] of Object.entries(toolsByCategory)) {
    if (tools.length > 1 && (category === 'chat' || category === 'coding')) {
      // Sort tools by spend ascending so we recommend keeping the most expensive/adopted one
      // or actually, recommend keeping the one with MOST seats (primary tool)
      const sortedBySeats = [...tools].sort((a, b) => b.seats - a.seats);
      const primaryTool = sortedBySeats[0];
      const redundantTools = sortedBySeats.slice(1);

      for (const redundant of redundantTools) {
        recommendations.push({
          id: generateId(),
          type: 'consolidation',
          tool: redundant.name,
          title: `Consolidate ${category} tools`,
          description: `You are using both ${primaryTool.name} and ${redundant.name}. Standardizing on ${primaryTool.name} across your team will eliminate redundant licenses.`,
          monthlySavings: redundant.spend,
          annualSavings: redundant.spend * 12,
          confidenceScore: 85
        });
      }
    }
  }

  // 5. Rule: Enterprise Downgrade for small teams
  const smallCompanyMatch = input.companySize.includes('1-10') || input.companySize.includes('11-50') || input.teamSize.includes('1-10');
  if (smallCompanyMatch) {
    for (const [toolName, details] of Object.entries(input.toolDetails)) {
      const toolData = TOOL_PRICING[toolName];
      if (!toolData) continue;
      
      const normalizedPlan = normalizePlanName(details.plan);
      if (normalizedPlan.includes('enterprise') || normalizedPlan.includes('business')) {
        // Recommend pro/team tier
        const cheaperPlan = Object.values(toolData.plans).find(p => p.id === 'pro' || p.id === 'team' || p.id === 'plus');
        
        if (cheaperPlan && cheaperPlan.pricePerSeatMonthly > 0) {
          const estimatedNewSpend = cheaperPlan.pricePerSeatMonthly * details.seats;
          if (details.monthlySpend > estimatedNewSpend) {
            const savings = details.monthlySpend - estimatedNewSpend;
            recommendations.push({
              id: generateId(),
              type: 'downgrade',
              tool: toolName,
              title: `Downgrade ${toolName} to ${cheaperPlan.name} Plan`,
              description: `Based on your company size, enterprise features might be underutilized. Downgrading ${details.seats} seats to the ${cheaperPlan.name} plan maintains core functionality at a fraction of the cost.`,
              monthlySavings: savings,
              annualSavings: savings * 12,
              confidenceScore: 75
            });
          }
        }
      }
    }
  }

  // 6. Rule: Alternative Recommendations
  for (const [toolName, details] of Object.entries(input.toolDetails)) {
    const toolData = TOOL_PRICING[toolName];
    if (!toolData || !toolData.alternatives || toolData.alternatives.length === 0) continue;
    
    // Check if there is an alternative that is significantly cheaper
    const currentPricePerSeat = details.monthlySpend / details.seats;
    
    for (const altName of toolData.alternatives) {
      const altData = TOOL_PRICING[altName];
      if (!altData) continue;
      
      // Find a comparable plan in the alternative (e.g., if pro, find pro)
      const currentPlan = findMatchingPlan(toolData, details.plan);
      if (!currentPlan) continue;
      
      // Attempt to find a plan with a similar ID/name or just the lowest tier that meets minimum seats
      const altPlan = Object.values(altData.plans).find(p => p.id === currentPlan.id) || Object.values(altData.plans)[0];
      
      if (altPlan && altPlan.pricePerSeatMonthly > 0 && altPlan.pricePerSeatMonthly < currentPricePerSeat) {
        const potentialMonthlySpend = altPlan.pricePerSeatMonthly * details.seats;
        // Only recommend if savings are notable (>15% cheaper)
        if (potentialMonthlySpend < details.monthlySpend * 0.85) {
          const savings = details.monthlySpend - potentialMonthlySpend;
          
          // Avoid duplicate 'alternative' recommendations for the same tool if one is already added
          const alreadyRecommended = recommendations.some(r => r.type === 'alternative' && r.tool === toolName);
          if (!alreadyRecommended) {
            recommendations.push({
              id: generateId(),
              type: 'alternative',
              tool: toolName,
              title: `Switch ${toolName} to ${altName}`,
              description: `Migrating your ${details.seats} seats to ${altName} (${altPlan.name} plan) would reduce your unit economics from $${currentPricePerSeat.toFixed(2)} to $${altPlan.pricePerSeatMonthly}/seat, improving your software margin.`,
              monthlySavings: savings,
              annualSavings: savings * 12,
              confidenceScore: 60 // Lower confidence since switching tools requires migration effort
            });
          }
        }
      }
    }
  }

  // 7. Calculate total savings
  // Sort recommendations by impact
  recommendations.sort((a, b) => b.monthlySavings - a.monthlySavings);
  
  // We can't sum all savings naively because some recommendations might be mutually exclusive 
  // (e.g., downgrade AND consolidate the same tool). 
  // For the final "Total Savings" metric, we take the best recommendation per tool.
  const bestSavingsPerTool = new Map<string, number>();
  
  for (const rec of recommendations) {
    const currentBest = bestSavingsPerTool.get(rec.tool) || 0;
    if (rec.monthlySavings > currentBest) {
      bestSavingsPerTool.set(rec.tool, rec.monthlySavings);
    }
  }

  let totalMonthlySavings = 0;
  for (const savings of Array.from(bestSavingsPerTool.values())) {
    totalMonthlySavings += savings;
  }

  // Cap the savings so optimized spend is not negative
  if (totalMonthlySavings > currentMonthlySpend) {
    totalMonthlySavings = currentMonthlySpend;
  }

  const optimizedMonthlySpend = currentMonthlySpend - totalMonthlySavings;

  return {
    currentMonthlySpend,
    currentAnnualSpend: currentMonthlySpend * 12,
    optimizedMonthlySpend,
    optimizedAnnualSpend: optimizedMonthlySpend * 12,
    totalMonthlySavings,
    totalAnnualSavings: totalMonthlySavings * 12,
    recommendations
  };
}
