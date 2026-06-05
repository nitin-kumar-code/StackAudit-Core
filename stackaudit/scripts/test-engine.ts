import { AuditEngine } from '../services/engine/AuditEngine';
import { SubscriptionData, SeatUsage } from '../services/engine/types';

const engine = new AuditEngine();

const mockSubscriptions: SubscriptionData[] = [
  // Duplication & Enterprise unnecessary: 20 Copilot Enterprise seats, 10 Cursor Pro seats
  { id: 'sub-001', toolId: 'github-copilot', tierId: 'copilot-enterprise-monthly', seats: 20, billingCycle: 'monthly', costPerSeat: 39 },
  { id: 'sub-002', toolId: 'cursor', tierId: 'cursor-pro-monthly', seats: 10, billingCycle: 'monthly', costPerSeat: 20 },
  
  // Team plan overkill: 10 ChatGPT Team seats, but only 2 active
  { id: 'sub-003', toolId: 'chatgpt', tierId: 'chatgpt-team-monthly', seats: 10, billingCycle: 'monthly', costPerSeat: 30 },
  
  // API Arbitrage: 20 Claude Pro seats, 15 are light users
  { id: 'sub-004', toolId: 'claude', tierId: 'claude-pro', seats: 20, billingCycle: 'monthly', costPerSeat: 20 }
];

const mockUsage: SeatUsage[] = [
  // Copilot: 20 active seats, but 15 use very few tokens (no PR/Enterprise features)
  ...Array(15).fill(0).map((_, i) => ({ seatId: `cp-${i}`, subscriptionId: 'sub-001', lastActiveDaysAgo: 2, tokensUsedMonthly: 2000 })),
  ...Array(5).fill(0).map((_, i) => ({ seatId: `cp-${i+15}`, subscriptionId: 'sub-001', lastActiveDaysAgo: 1, tokensUsedMonthly: 60000 })),
  
  // Cursor: 10 highly active users
  ...Array(10).fill(0).map((_, i) => ({ seatId: `cr-${i}`, subscriptionId: 'sub-002', lastActiveDaysAgo: 1 })),
  
  // ChatGPT: 2 active, 8 inactive (>30 days)
  ...Array(2).fill(0).map((_, i) => ({ seatId: `cg-${i}`, subscriptionId: 'sub-003', lastActiveDaysAgo: 1 })),
  ...Array(8).fill(0).map((_, i) => ({ seatId: `cg-${i+2}`, subscriptionId: 'sub-003', lastActiveDaysAgo: 45 })),
  
  // Claude: 5 heavy users, 15 light users (< 100k tokens)
  ...Array(5).fill(0).map((_, i) => ({ seatId: `cl-${i}`, subscriptionId: 'sub-004', lastActiveDaysAgo: 3, tokensUsedMonthly: 500000 })),
  ...Array(15).fill(0).map((_, i) => ({ seatId: `cl-${i+5}`, subscriptionId: 'sub-004', lastActiveDaysAgo: 10, tokensUsedMonthly: 25000 }))
];

// Let's modify the sub-002 to Team to trigger alternative rule
mockSubscriptions[1].tierId = 'chatgpt-team-monthly';
mockSubscriptions[1].costPerSeat = 30;
mockUsage.push(...Array(10).fill(0).map((_, i) => ({ seatId: `cg-${i}`, subscriptionId: 'sub-002', lastActiveDaysAgo: 1 })));

const results = engine.runAudit(mockSubscriptions, mockUsage);

console.log('--- AUDIT ENGINE RESULTS ---\n');
console.log(`Total Monthly Savings: $${results.totalMonthlySavings}`);
console.log(`Total Annual Savings: $${results.totalAnnualSavings}\n`);

results.recommendations.forEach(rec => {
  console.log(`[${rec.type}] (Confidence: ${rec.confidenceScore}%)`);
  console.log(`Finance Reasoning: ${rec.financeReasoning}`);
  console.log(`Savings: $${rec.monthlySavings}/mo ($${rec.annualSavings}/yr)\n`);
});
