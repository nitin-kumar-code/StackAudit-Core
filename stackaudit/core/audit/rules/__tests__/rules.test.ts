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
    currentMetrics: { totalCost: 100, totalTokens: 10000, requestCount: 100 },
    baselineMetrics: { totalCost: 100, totalTokens: 10000, requestCount: 100 }
  };

  describe('UsageSpikeRule', () => {
    const rule = new UsageSpikeRule();

    it('returns null if usage is below sample size threshold', () => {
      const ctx = { ...baseContext, currentMetrics: { ...baseContext.currentMetrics, requestCount: 10 } };
      expect(rule.evaluate(ctx)).toBeNull();
    });

    it('returns finding if usage spikes above threshold', () => {
      // Baseline 100 reqs, Current 160 reqs (60% spike)
      const ctx = { 
        ...baseContext, 
        currentMetrics: { ...baseContext.currentMetrics, requestCount: 160 } 
      };
      
      const finding = rule.evaluate(ctx);
      expect(finding).toBeDefined();
      expect(finding?.category).toBe('USAGE_SPIKE');
      expect(finding?.severity).toBe('MEDIUM');
      expect(finding?.evidence.changePercent).toBe(60);
    });
  });

  describe('CostDriftRule', () => {
    const rule = new CostDriftRule();

    it('returns finding if cost increases significantly MORE than usage', () => {
      // Usage increased 10% (100 -> 110)
      // Cost increased 50% (100 -> 150)
      // Drift = 40% (0.40 > 0.30 threshold)
      const ctx = { 
        ...baseContext, 
        baselineMetrics: { ...baseContext.baselineMetrics, totalCost: 100, requestCount: 100 },
        currentMetrics: { ...baseContext.currentMetrics, totalCost: 150, requestCount: 110 } 
      };
      
      const finding = rule.evaluate(ctx);
      expect(finding).toBeDefined();
      expect(finding?.category).toBe('COST_DRIFT');
      expect(finding?.evidence.changePercent).toBe(50);
    });

    it('returns finding utilizing Outcome Data when available', () => {
      // Outcomes increased 5% (100 -> 105)
      // Cost increased 45% (100 -> 145)
      const ctx = { 
        ...baseContext, 
        currentMetrics: { ...baseContext.currentMetrics, totalCost: 145, requestCount: 200 },
        currentOutcomes: { ticket_resolved: 105 },
        baselineOutcomes: { ticket_resolved: 100 }
      };
      
      const finding = rule.evaluate(ctx);
      expect(finding).toBeDefined();
      expect(finding?.category).toBe('COST_DRIFT');
      expect(finding?.evidence.details?.volumeMetric).toBe('outcome_count');
      expect(finding?.evidence.details?.volumeChangePercent).toBe(5);
    });

    it('returns null if cost increases proportionally with usage', () => {
      // Usage +50%, Cost +50%. Drift = 0.
      const ctx = { 
        ...baseContext, 
        baselineMetrics: { ...baseContext.baselineMetrics, totalCost: 100, requestCount: 100 },
        currentMetrics: { ...baseContext.currentMetrics, totalCost: 150, requestCount: 150 } 
      };
      
      expect(rule.evaluate(ctx)).toBeNull();
    });
  });

  describe('TokenEfficiencyRule', () => {
    const rule = new TokenEfficiencyRule();

    it('returns finding if tokens per request spike', () => {
      // Baseline 100 tokens/req (10000 / 100)
      // Current 150 tokens/req (15000 / 100) -> +50%
      const ctx = { 
        ...baseContext, 
        currentMetrics: { ...baseContext.currentMetrics, totalTokens: 15000 } 
      };
      
      const finding = rule.evaluate(ctx);
      expect(finding).toBeDefined();
      expect(finding?.category).toBe('TOKEN_EFFICIENCY');
      expect(finding?.evidence.changePercent).toBe(50);
    });
  });

  describe('ModelMixRule', () => {
    const rule = new ModelMixRule();

    it('returns finding if model share shifts significantly', () => {
      const ctx = { 
        ...baseContext,
        baselineMetrics: {
          ...baseContext.baselineMetrics,
          requestCount: 100,
          models: {
            'gpt-3.5': { cost: 10, tokens: 5000, requests: 90 },
            'gpt-4': { cost: 50, tokens: 5000, requests: 10 }
          }
        },
        currentMetrics: {
          ...baseContext.currentMetrics,
          requestCount: 100,
          models: {
            'gpt-3.5': { cost: 5, tokens: 2000, requests: 35 },
            'gpt-4': { cost: 300, tokens: 30000, requests: 65 }
          }
        }
      };
      
      // Shift from 10% to 65% = 55% shift (> 20% threshold)
      const finding = rule.evaluate(ctx);
      expect(finding).toBeDefined();
      expect(finding?.category).toBe('MODEL_MIX');
      expect(finding?.evidence.changePercent).toBe(55);
    });
  });
});
