import { describe, it, expect } from 'vitest';

interface AttributedUsageRow { calculated_cost: string; workload_id: string | null }

function calculateSpendBreakdown(attributedUsageRows: AttributedUsageRow[]) {
  let totalSpend = 0;
  let attributedSpend = 0;
  let unattributedSpend = 0;

  for (const row of attributedUsageRows) {
    const cost = parseFloat(row.calculated_cost);
    totalSpend += cost;
    if (row.workload_id) {
      attributedSpend += cost;
    } else {
      unattributedSpend += cost;
    }
  }

  return { totalSpend, attributedSpend, unattributedSpend };
}

describe('Spend Reconciliation', () => {
  it('ensures workload totals plus unattributed always equal total spend', () => {
    // Simulated output of `SELECT * FROM v_attributed_usage_events`
    const mockRows = [
      { id: '1', calculated_cost: '10.50', api_key_id: 'key_123', workload_id: 'wl_A' },
      { id: '2', calculated_cost: '5.25', api_key_id: 'key_123', workload_id: 'wl_A' },
      // This row has api_key_id missing OR doesn't match a rule, so workload_id is null
      { id: '3', calculated_cost: '2.00', api_key_id: null, workload_id: null },
      { id: '4', calculated_cost: '1.00', api_key_id: 'unknown_key', workload_id: null }
    ];

    const breakdown = calculateSpendBreakdown(mockRows);

    expect(breakdown.totalSpend).toBe(18.75); // 10.50 + 5.25 + 2.00 + 1.00
    expect(breakdown.attributedSpend).toBe(15.75); // 10.50 + 5.25
    expect(breakdown.unattributedSpend).toBe(3.00); // 2.00 + 1.00
    
    // Core invariant
    expect(breakdown.attributedSpend + breakdown.unattributedSpend).toBe(breakdown.totalSpend);
  });
});
