export const AUDIT_THRESHOLDS = {
  // Minimum events in the current window to confidently trigger an audit finding
  MIN_SAMPLE_SIZE: 50,
  
  // Percentage increase (e.g., 0.50 = 50%) required to trigger
  USAGE_SPIKE_PERCENT: 0.50,
  COST_DRIFT_PERCENT: 0.30,
  TOKEN_GROWTH_PERCENT: 0.40,
  
  // Minimum absolute shift in model mix percentage (e.g., 0.20 = 20% shift)
  MODEL_MIX_SHIFT_PERCENT: 0.20,

  // Minimum baseline cost to care about cost drift (avoid alerting on a drift from $0.10 to $0.20)
  MIN_BASELINE_COST_USD: 10.0,
};
