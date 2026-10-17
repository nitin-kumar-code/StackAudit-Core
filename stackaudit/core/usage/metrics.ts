import Big from 'big.js';

export interface UsageTokenCounts {
  input_tokens: number | null;
  output_tokens: number | null;
}

/** Cache token columns are breakdowns of input tokens, so they are not added again. */
export function getTotalTokenCount(usage: UsageTokenCounts): number {
  return (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0);
}

/** Historical rows may have a null request count; one event represents one request. */
export function getRequestCount(requestCount: number | null | undefined): number {
  return requestCount ?? 1;
}

export interface UsageCostRow {
  calculated_cost: string | number | null;
  is_unpriced?: boolean | null;
}

export interface UsageCostSummary {
  /** The sum of known prices. Null means there are no priced events to sum. */
  knownCost: string | null;
  /** The authoritative total. Null means at least one event has unknown cost. */
  totalCost: string | null;
  isComplete: boolean;
  pricedEventCount: number;
  unpricedEventCount: number;
}

/** Summarize only known prices; never add the stored placeholder for unpriced rows. */
export function aggregateUsageCosts(rows: UsageCostRow[]): UsageCostSummary {
  let knownCost = new Big(0);
  let pricedEventCount = 0;
  let unpricedEventCount = 0;

  for (const row of rows) {
    if (row.is_unpriced === true) {
      unpricedEventCount++;
      continue;
    }
    if (row.calculated_cost === null) {
      throw new Error('A priced usage event is missing calculated_cost.');
    }
    knownCost = knownCost.plus(String(row.calculated_cost));
    pricedEventCount++;
  }

  const isComplete = unpricedEventCount === 0;
  const knownCostValue = pricedEventCount > 0 || rows.length === 0 ? knownCost.toFixed() : null;

  return {
    knownCost: knownCostValue,
    totalCost: isComplete ? knownCost.toFixed() : null,
    isComplete,
    pricedEventCount,
    unpricedEventCount
  };
}

/** Calculate CPO only for a caller-defined matching workload/outcome scope. */
export function calculateCostPerOutcome(
  costs: UsageCostSummary,
  outcomeCount: number | null | undefined
): { value: string | null; reason: string | null } {
  if (outcomeCount === null || outcomeCount === undefined || outcomeCount <= 0) {
    return { value: null, reason: 'No outcomes are recorded for this scope and time window.' };
  }
  if (!costs.isComplete || costs.totalCost === null) {
    return { value: null, reason: 'Cost per outcome is unavailable because usage pricing is incomplete.' };
  }
  return { value: new Big(costs.totalCost).div(outcomeCount).toString(), reason: null };
}
