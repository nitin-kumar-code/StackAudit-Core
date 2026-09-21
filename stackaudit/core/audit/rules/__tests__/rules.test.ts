import { describe, it, expect } from 'vitest';
import { UsageSpikeRule } from '../usage-spike';
import { CostDriftRule } from '../cost-drift';
import { TokenEfficiencyRule } from '../token-efficiency';
import { ModelMixRule } from '../model-mix';
import { AuditContext } from '../../types';

describe('Audit Rules', () => {
  const baseContext: AuditContext = {
    organizationId: 'org_1',
    workloadId: 'wl_1',
    currentWindow: { start: new Date('2026-09-02T00:00:00Z'), end: new Date('2026-09-03T00:00:00Z') },
    baselineWindow: { start: new Date('2026-09-01T00:00:00Z'), end: new Date('2026-09-02T00:00:00Z') },
    currentMetrics: { totalCost: 100, totalTokens: 10000, requestCount: 100, unpricedEvents: 0 },
    baselineMetrics: { totalCost: 100, totalTokens: 10000, requestCount: 100, unpricedEvents: 0 }
  };

  describe('UsageSpikeRule', () => {
    const rule = new UsageSpikeRule();

    it('throws SkipError if usage is below sample size threshold', () => {
      const ctx = { ...baseContext, currentMetrics: { ...baseContext.currentMetrics, requestCount: 10 } };
      expect(() => rule.evaluate(ctx)).toThrow(/Skipped/);
    });

    it('returns finding if usage spikes above threshold', () => {
      const ctx = { ...baseContext, currentMetrics: { ...baseContext.currentMetrics, requestCount: 160 } };
      const finding = rule.evaluate(ctx);
      expect(finding).toBeDefined();
      expect(finding?.category).toBe('USAGE_SPIKE');
    });
  });

  describe('CostDriftRule', () => {
    const rule = new CostDriftRule();

    it('returns finding comparing UNIT COST directly', () => {
      const ctx = { 
        ...baseContext, 
        currentMetrics: { ...baseContext.currentMetrics, totalCost: 150, requestCount: 110 } 
      };
      
      const finding = rule.evaluate(ctx);
      expect(finding).toBeDefined();
      expect(finding?.category).toBe('COST_DRIFT');
      expect(finding?.evidence.changePercent).toBeGreaterThan(30);
    });

    it('handles primary outcome unit cost successfully', () => {
      const ctx = { 
        ...baseContext, 
        currentMetrics: { ...baseContext.currentMetrics, totalCost: 150, requestCount: 200 },
        currentOutcomes: { ticket_resolved: 50, email_drafted: 10 },
        baselineOutcomes: { ticket_resolved: 50, email_drafted: 5 }
      };
      
      const finding = rule.evaluate(ctx);
      expect(finding).toBeDefined();
      expect(finding?.evidence.details?.volumeMetric).toBe('outcome_ticket_resolved');
      expect(finding?.evidence.changePercent).toBe(50);
    });
    
    it('throws SkipError if unpriced events exist', () => {
      const ctx = { 
        ...baseContext, 
        currentMetrics: { ...baseContext.currentMetrics, totalCost: 150, requestCount: 110, unpricedEvents: 5 } 
      };
      
      expect(() => rule.evaluate(ctx)).toThrow(/unpriced events/);
    });
  });

  describe('TokenEfficiencyRule', () => {
    const rule = new TokenEfficiencyRule();

    it('returns finding if tokens per request spike', () => {
      const ctx = { ...baseContext, currentMetrics: { ...baseContext.currentMetrics, totalTokens: 15000 } };
      const finding = rule.evaluate(ctx);
      expect(finding).toBeDefined();
      expect(finding?.category).toBe('TOKEN_EFFICIENCY');
      expect(finding?.evidence.changePercent).toBe(50);
    });
  });
});
