import { describe, it, expect, beforeEach } from 'vitest';
import { AuditEngine } from '../AuditEngine';
import { SubscriptionData, SeatUsage } from '../types';

describe('AuditEngine', () => {
  let engine: AuditEngine;

  beforeEach(() => {
    // We instantiate without custom catalog, so it uses the deterministic PRICING_CATALOG
    engine = new AuditEngine();
  });

  describe('Invalid Inputs & Edge Cases', () => {
    it('should handle empty subscriptions and usage arrays gracefully', () => {
      const result = engine.runAudit([], []);
      expect(result.totalMonthlySavings).toBe(0);
      expect(result.totalAnnualSavings).toBe(0);
      expect(result.recommendations.length).toBe(0);
    });

    it('should ignore subscriptions referencing tools not in catalog', () => {
      const invalidSub: SubscriptionData[] = [{
        id: 'sub-invalid',
        toolId: 'non-existent-tool-999',
        tierId: 'unknown-tier',
        seats: 10,
        billingCycle: 'monthly',
        costPerSeat: 50
      }];
      const result = engine.runAudit(invalidSub, []);
      expect(result.recommendations.length).toBe(0);
    });

    it('should handle usage data with missing tokens gracefully without throwing', () => {
      const subs: SubscriptionData[] = [{
        id: 'sub-001',
        toolId: 'github-copilot',
        tierId: 'copilot-business-monthly',
        seats: 5,
        billingCycle: 'monthly',
        costPerSeat: 19
      }];
      // Active seats, but tokensUsedMonthly is undefined (valid in types)
      const usage: SeatUsage[] = [
        { seatId: '1', subscriptionId: 'sub-001', lastActiveDaysAgo: 2 }
      ];
      
      const result = engine.runAudit(subs, usage);
      // It shouldn't crash. It shouldn't recommend UnusedSeatRule because they are active.
      expect(result.recommendations.filter(r => r.type === 'CANCEL').length).toBe(0);
    });
  });

  describe('Unused Seat Rule', () => {
    it('should detect stale seats and calculate correct savings', () => {
      const subs: SubscriptionData[] = [{
        id: 'sub-001',
        toolId: 'chatgpt',
        tierId: 'chatgpt-plus',
        seats: 10,
        billingCycle: 'monthly',
        costPerSeat: 20
      }];
      
      const usage: SeatUsage[] = [
        // 2 active seats
        { seatId: '1', subscriptionId: 'sub-001', lastActiveDaysAgo: 5 },
        { seatId: '2', subscriptionId: 'sub-001', lastActiveDaysAgo: 1 },
        // 3 stale seats (> 30 days)
        { seatId: '3', subscriptionId: 'sub-001', lastActiveDaysAgo: 45 },
        { seatId: '4', subscriptionId: 'sub-001', lastActiveDaysAgo: 60 },
        { seatId: '5', subscriptionId: 'sub-001', lastActiveDaysAgo: 90 },
      ];

      const result = engine.runAudit(subs, usage);
      
      // We expect 1 recommendation for cancellation
      const cancelRecs = result.recommendations.filter(r => r.type === 'CANCEL');
      expect(cancelRecs.length).toBe(1);
      
      const rec = cancelRecs[0];
      expect(rec.affectedSeats).toBe(3); // The 3 stale seats
      expect(rec.monthlySavings).toBe(60); // 3 * $20
      expect(rec.annualSavings).toBe(720); // 60 * 12
      expect(rec.confidenceScore).toBe(100);
    });
  });

  describe('Team Plan Overkill Rule', () => {
    it('should recommend downgrade to individual plan when active users are low', () => {
      const subs: SubscriptionData[] = [{
        id: 'sub-team',
        toolId: 'chatgpt',
        tierId: 'chatgpt-team-monthly',
        seats: 5, // minimum usually required by team plans
        billingCycle: 'monthly',
        costPerSeat: 30 // $150 total
      }];

      const usage: SeatUsage[] = [
        // Only 2 active users
        { seatId: '1', subscriptionId: 'sub-team', lastActiveDaysAgo: 2 },
        { seatId: '2', subscriptionId: 'sub-team', lastActiveDaysAgo: 5 }
      ];

      const result = engine.runAudit(subs, usage);
      
      const downgradeRec = result.recommendations.find(r => r.id.includes('rule-team-overkill'));
      expect(downgradeRec).toBeDefined();
      // Moving 2 active users to ChatGPT Plus ($20) = $40. 
      // Current cost $150. Savings = $110/mo
      expect(downgradeRec?.monthlySavings).toBe(110);
      expect(downgradeRec?.annualSavings).toBe(1320);
    });
  });

  describe('Enterprise Unnecessary Rule', () => {
    it('should downgrade Enterprise licenses for light feature users', () => {
      const subs: SubscriptionData[] = [{
        id: 'sub-ent',
        toolId: 'github-copilot',
        tierId: 'copilot-enterprise-monthly',
        seats: 10,
        billingCycle: 'monthly',
        costPerSeat: 39
      }];

      const usage: SeatUsage[] = [
        // 4 heavy users utilizing Enterprise features (assumed via high token count)
        ...Array(4).fill(0).map((_, i) => ({ seatId: `h-${i}`, subscriptionId: 'sub-ent', lastActiveDaysAgo: 1, tokensUsedMonthly: 50000 })),
        // 6 light users using basic features
        ...Array(6).fill(0).map((_, i) => ({ seatId: `l-${i}`, subscriptionId: 'sub-ent', lastActiveDaysAgo: 1, tokensUsedMonthly: 1000 }))
      ];

      const result = engine.runAudit(subs, usage);
      
      const enterpriseRec = result.recommendations.find(r => r.id.includes('rule-enterprise-unnecessary'));
      expect(enterpriseRec).toBeDefined();
      expect(enterpriseRec?.affectedSeats).toBe(6);
      // $39 to $19 is $20 savings. 6 seats = $120
      expect(enterpriseRec?.monthlySavings).toBe(120);
    });
  });

  describe('Duplication Rule', () => {
    it('should detect overlapping tools in the same category', () => {
      const subs: SubscriptionData[] = [
        { id: 'sub-1', toolId: 'github-copilot', tierId: 'copilot-business-monthly', seats: 20, billingCycle: 'monthly', costPerSeat: 19 },
        { id: 'sub-2', toolId: 'cursor', tierId: 'cursor-pro-monthly', seats: 5, billingCycle: 'monthly', costPerSeat: 20 }
      ];

      const usage: SeatUsage[] = [
        // Copilot is heavily used
        ...Array(20).fill(0).map((_, i) => ({ seatId: `c-${i}`, subscriptionId: 'sub-1', lastActiveDaysAgo: 1 })),
        // Cursor is used by a splinter group
        ...Array(5).fill(0).map((_, i) => ({ seatId: `cr-${i}`, subscriptionId: 'sub-2', lastActiveDaysAgo: 2 }))
      ];

      const result = engine.runAudit(subs, usage);
      
      const dupRec = result.recommendations.find(r => r.id.includes('rule-duplication'));
      expect(dupRec).toBeDefined();
      expect(dupRec?.type).toBe('CANCEL');
      expect(dupRec?.toolId).toBe('cursor'); // Because Copilot is the primary tool
      expect(dupRec?.monthlySavings).toBe(100); // 5 * 20
    });
  });

  describe('API Arbitrage Rule', () => {
    it('should recommend API for highly under-utilized seats', () => {
      const subs: SubscriptionData[] = [{
        id: 'sub-claude',
        toolId: 'claude',
        tierId: 'claude-pro',
        seats: 5,
        billingCycle: 'monthly',
        costPerSeat: 20
      }];

      const usage: SeatUsage[] = [
        // 5 active users, but extremely low token consumption
        ...Array(5).fill(0).map((_, i) => ({ seatId: `cl-${i}`, subscriptionId: 'sub-claude', lastActiveDaysAgo: 5, tokensUsedMonthly: 5000 }))
      ];

      const result = engine.runAudit(subs, usage);
      
      const apiRec = result.recommendations.find(r => r.id.includes('rule-api-arbitrage'));
      expect(apiRec).toBeDefined();
      expect(apiRec?.suggestedAlternativeToolId).toBe('anthropic-api');
      // Moving 5 users from $20 to estimated $2
      expect(apiRec?.monthlySavings).toBe(90); // 5 * ($20 - $2)
    });
  });

  describe('Annual Calculation Logic', () => {
    it('should calculate global totals correctly', () => {
      const subs: SubscriptionData[] = [{
        id: 'sub-stale',
        toolId: 'chatgpt',
        tierId: 'chatgpt-plus',
        seats: 10,
        billingCycle: 'monthly',
        costPerSeat: 20
      }];

      const usage: SeatUsage[] = [
        // All 10 are stale
        ...Array(10).fill(0).map((_, i) => ({ seatId: `s-${i}`, subscriptionId: 'sub-stale', lastActiveDaysAgo: 99 }))
      ];

      const result = engine.runAudit(subs, usage);
      
      // Monthly savings = 10 * 20 = 200
      // Annual savings = 200 * 12 = 2400
      expect(result.totalMonthlySavings).toBe(200);
      expect(result.totalAnnualSavings).toBe(2400);
      
      // Ensure the engine result totals strictly match the sum of individual recommendations
      const sumMonthly = result.recommendations.reduce((acc, rec) => acc + rec.monthlySavings, 0);
      const sumAnnual = result.recommendations.reduce((acc, rec) => acc + rec.annualSavings, 0);
      
      expect(result.totalMonthlySavings).toBe(sumMonthly);
      expect(result.totalAnnualSavings).toBe(sumAnnual);
    });
  });
});
