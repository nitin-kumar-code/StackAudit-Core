import { UsageSpikeRule } from './usage-spike';
import { CostDriftRule } from './cost-drift';
import { TokenEfficiencyRule } from './token-efficiency';
import { ModelMixRule } from './model-mix';
import { AuditRule } from '../types';

export const ALL_RULES: AuditRule[] = [
  new UsageSpikeRule(),
  new CostDriftRule(),
  new TokenEfficiencyRule(),
  new ModelMixRule()
];

export { UsageSpikeRule, CostDriftRule, TokenEfficiencyRule, ModelMixRule };
