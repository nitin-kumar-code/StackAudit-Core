import { AuditEngine } from '../services/engine/AuditEngine';
import { SubscriptionData, SeatUsage } from '../services/engine/types';

const engine = new AuditEngine();

const mockSubscriptions: SubscriptionData[] = [
  {
    id: 'sub-001',
    toolId: 'github-copilot',
    tierId: 'copilot-business-monthly',
    seats: 50,
    billingCycle: 'monthly',
    costPerSeat: 19
  },
  {
    id: 'sub-002',
    toolId: 'chatgpt',
    tierId: 'chatgpt-plus',
    seats: 10,
    billingCycle: 'monthly',
    costPerSeat: 20
  },
  {
    id: 'sub-003',
    toolId: 'midjourney',
    tierId: 'midjourney-standard-monthly',
    seats: 5,
    billingCycle: 'monthly',
    costPerSeat: 30
  }
];

const mockUsage: SeatUsage[] = [
  // Copilot: 10 inactive seats, 40 active seats
  ...Array(10).fill(0).map((_, i) => ({ seatId: `cp-${i}`, subscriptionId: 'sub-001', lastActiveDaysAgo: 45 })),
  ...Array(40).fill(0).map((_, i) => ({ seatId: `cp-${i+10}`, subscriptionId: 'sub-001', lastActiveDaysAgo: 2 })),
  
  // ChatGPT: 10 active seats (Alternative rule should recommend Claude at $20, wait Claude is $20 so no savings. Wait, what if ChatGPT is $30 and Claude is $20?)
  // Actually ChatGPT Plus is $20, Claude Pro is $20. So no alternative savings.
  // But wait, what if ChatGPT Team is $30? Let's change sub-002 to Team tier to see alternative rule.
  
  // Midjourney: 5 active seats, but they should be moved to annual commit
  ...Array(5).fill(0).map((_, i) => ({ seatId: `mj-${i}`, subscriptionId: 'sub-003', lastActiveDaysAgo: 5 })),
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
