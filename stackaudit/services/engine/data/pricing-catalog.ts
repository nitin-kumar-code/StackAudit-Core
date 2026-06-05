import { ToolPricing } from '../types';

export const PRICING_CATALOG: ToolPricing[] = [
  // Coding Assistants
  {
    toolId: 'github-copilot',
    name: 'GitHub Copilot',
    category: 'coding-assistant',
    alternatives: ['cursor', 'windsurf'],
    tiers: [
      { id: 'copilot-business-monthly', name: 'Copilot Business', billingCycle: 'monthly', pricePerSeat: 19, features: ['code-completion', 'chat'] },
      { id: 'copilot-enterprise-monthly', name: 'Copilot Enterprise', billingCycle: 'monthly', pricePerSeat: 39, features: ['code-completion', 'chat', 'repo-context', 'pr-summaries'] },
    ],
  },
  {
    toolId: 'cursor',
    name: 'Cursor',
    category: 'coding-assistant',
    alternatives: ['github-copilot', 'windsurf'],
    tiers: [
      { id: 'cursor-pro-monthly', name: 'Cursor Pro', billingCycle: 'monthly', pricePerSeat: 20, features: ['premium-models', 'composer'] },
      { id: 'cursor-business-monthly', name: 'Cursor Business', billingCycle: 'monthly', pricePerSeat: 40, features: ['premium-models', 'composer', 'privacy', 'centralized-billing'] },
    ],
  },
  {
    toolId: 'windsurf',
    name: 'Windsurf',
    category: 'coding-assistant',
    alternatives: ['github-copilot', 'cursor'],
    tiers: [
      { id: 'windsurf-pro-monthly', name: 'Windsurf Pro', billingCycle: 'monthly', pricePerSeat: 15, features: ['cascade', 'premium-models'] },
    ],
  },

  // LLMs
  {
    toolId: 'chatgpt',
    name: 'ChatGPT',
    category: 'llm',
    alternatives: ['claude', 'gemini'],
    tiers: [
      { id: 'chatgpt-plus', name: 'ChatGPT Plus', billingCycle: 'monthly', pricePerSeat: 20, features: ['gpt-4o', 'dalle-3', 'data-analysis'] },
      { id: 'chatgpt-team-monthly', name: 'ChatGPT Team', billingCycle: 'monthly', pricePerSeat: 30, features: ['gpt-4o', 'workspace', 'no-training-data'] },
    ],
  },
  {
    toolId: 'claude',
    name: 'Claude',
    category: 'llm',
    alternatives: ['chatgpt', 'gemini'],
    tiers: [
      { id: 'claude-pro', name: 'Claude Pro', billingCycle: 'monthly', pricePerSeat: 20, features: ['opus', 'sonnet', 'projects'] },
      { id: 'claude-team', name: 'Claude Team', billingCycle: 'monthly', pricePerSeat: 30, features: ['opus', 'sonnet', 'projects', 'centralized-billing'] },
    ],
  },
  {
    toolId: 'gemini',
    name: 'Google Gemini',
    category: 'llm',
    alternatives: ['chatgpt', 'claude'],
    tiers: [
      { id: 'gemini-advanced', name: 'Gemini Advanced', billingCycle: 'monthly', pricePerSeat: 20, features: ['gemini-1.5-pro', 'docs-integration'] },
      { id: 'gemini-enterprise', name: 'Gemini Enterprise', billingCycle: 'monthly', pricePerSeat: 30, features: ['gemini-1.5-pro', 'workspace-integration'] },
    ],
  },

  // APIs (Modeled as pseudo-subscriptions for arbitrage rule)
  {
    toolId: 'openai-api',
    name: 'OpenAI API',
    category: 'llm',
    alternatives: [],
    tiers: [
      { id: 'openai-api-payg', name: 'Pay-as-you-go', billingCycle: 'monthly', pricePerSeat: 2, features: ['api-access'] }, // Estimated $2/mo per light user
    ],
  },
  {
    toolId: 'anthropic-api',
    name: 'Anthropic API',
    category: 'llm',
    alternatives: [],
    tiers: [
      { id: 'anthropic-api-payg', name: 'Pay-as-you-go', billingCycle: 'monthly', pricePerSeat: 2, features: ['api-access'] },
    ],
  }
];
