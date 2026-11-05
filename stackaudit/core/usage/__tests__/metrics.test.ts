import { describe, expect, it } from 'vitest';
import { aggregateUsageCosts, calculateCostPerOutcome, getRequestCount, getTotalTokenCount } from '../metrics';

describe('usage metrics', () => {
  it('counts cache tokens within the input total instead of adding them twice', () => {
    expect(getTotalTokenCount({ input_tokens: 100, output_tokens: 20 })).toBe(120);
  });

  it('counts null token fields as zero', () => {
    expect(getTotalTokenCount({ input_tokens: null, output_tokens: 20 })).toBe(20);
  });

  it('uses one request for legacy rows without a request count', () => {
    expect(getRequestCount(null)).toBe(1);
    expect(getRequestCount(0)).toBe(0);
    expect(getRequestCount(4)).toBe(4);
  });

  it('reconciles fully priced events with decimal-safe sums', () => {
    expect(aggregateUsageCosts([
      { calculated_cost: '0.10', is_unpriced: false },
      { calculated_cost: '0.20', is_unpriced: false }
    ])).toEqual({ knownCost: '0.3', totalCost: '0.3', isComplete: true, pricedEventCount: 2, unpricedEventCount: 0 });
  });

  it('shows a priced subtotal and marks it partial when some events are unpriced', () => {
    expect(aggregateUsageCosts([
      { calculated_cost: '4.25', is_unpriced: false },
      { calculated_cost: '0', is_unpriced: true }
    ])).toEqual({ knownCost: '4.25', totalCost: null, isComplete: false, pricedEventCount: 1, unpricedEventCount: 1 });
  });

  it('does not turn all-unpriced usage into a known zero', () => {
    expect(aggregateUsageCosts([
      { calculated_cost: '0', is_unpriced: true },
      { calculated_cost: '0', is_unpriced: true }
    ])).toEqual({ knownCost: null, totalCost: null, isComplete: false, pricedEventCount: 0, unpricedEventCount: 2 });
  });

  it('preserves a genuine calculated zero cost', () => {
    expect(aggregateUsageCosts([{ calculated_cost: '0', is_unpriced: false }])).toEqual({
      knownCost: '0', totalCost: '0', isComplete: true, pricedEventCount: 1, unpricedEventCount: 0
    });
  });

  it('calculates CPO only within a complete workload/outcome scope', () => {
    const workloadA = aggregateUsageCosts([{ calculated_cost: '100', is_unpriced: false }]);
    const workloadB = aggregateUsageCosts([{ calculated_cost: '500', is_unpriced: false }]);
    expect(calculateCostPerOutcome(workloadA, 20).value).toBe('5');
    expect(calculateCostPerOutcome(workloadB, 0).value).toBeNull();
  });

  it('only calculates CPO when workload cost maps to a single outcome type', () => {
    const costs = aggregateUsageCosts([{ calculated_cost: '120', is_unpriced: false }]);
    expect(calculateCostPerOutcome(costs, 20).value).toBe('6');
    expect(calculateCostPerOutcome(costs, 10, 2)).toMatchObject({
      value: null,
      reason: expect.stringContaining('multiple outcome types')
    });
  });

  it('does not calculate CPO when pricing is partial, outcomes are absent, or count is zero', () => {
    const partial = aggregateUsageCosts([
      { calculated_cost: '20', is_unpriced: false },
      { calculated_cost: '0', is_unpriced: true }
    ]);
    expect(calculateCostPerOutcome(partial, 5).value).toBeNull();
    expect(calculateCostPerOutcome(partial, 5).reason).toMatch(/pricing is incomplete/);
    expect(calculateCostPerOutcome(aggregateUsageCosts([]), 0).value).toBeNull();
    expect(calculateCostPerOutcome(aggregateUsageCosts([]), null).value).toBeNull();
  });

  it('can reconcile organization and workload costs from the same usage rows', () => {
    const usage = [
      { calculated_cost: '10.25', is_unpriced: false, workload: 'A' },
      { calculated_cost: '5.75', is_unpriced: false, workload: 'B' },
      { calculated_cost: '0', is_unpriced: true, workload: 'A' }
    ];
    const organization = aggregateUsageCosts(usage);
    const workloadA = aggregateUsageCosts(usage.filter(row => row.workload === 'A'));
    const workloadB = aggregateUsageCosts(usage.filter(row => row.workload === 'B'));
    expect(organization.knownCost).toBe('16');
    expect(organization.totalCost).toBeNull();
    expect(workloadA.knownCost).toBe('10.25');
    expect(workloadA.isComplete).toBe(false);
    expect(workloadB.totalCost).toBe('5.75');
  });
});
