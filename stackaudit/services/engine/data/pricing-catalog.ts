import { ToolPricing } from '../types';

export const PRICING_CATALOG: ToolPricing[] = [
  {
    toolId: 'github-copilot',
    name: 'GitHub Copilot',
    category: 'coding-assistant',
    alternatives: ['cursor', 'amazon-q'],
    tiers: [
      {
        id: 'copilot-business-monthly',
        name: 'Copilot Business',
        billingCycle: 'monthly',
        pricePerSeat: 19,
        features: ['code-completion', 'chat', 'enterprise-privacy'],
      },
      {
        id: 'copilot-enterprise-monthly',
        name: 'Copilot Enterprise',
        billingCycle: 'monthly',
        pricePerSeat: 39,
        features: ['code-completion', 'chat', 'enterprise-privacy', 'repo-context', 'pr-summaries'],
      },
    ],
  },
  {
    toolId: 'chatgpt',
    name: 'ChatGPT',
    category: 'llm',
    alternatives: ['claude'],
    tiers: [
      {
        id: 'chatgpt-plus',
        name: 'ChatGPT Plus',
        billingCycle: 'monthly',
        pricePerSeat: 20,
        features: ['gpt-4', 'dalle-3', 'data-analysis'],
      },
      {
        id: 'chatgpt-team-monthly',
        name: 'ChatGPT Team',
        billingCycle: 'monthly',
        pricePerSeat: 30,
        features: ['gpt-4', 'workspace', 'no-training-data'],
      },
      {
        id: 'chatgpt-team-annual',
        name: 'ChatGPT Team',
        billingCycle: 'annual',
        pricePerSeat: 25,
        features: ['gpt-4', 'workspace', 'no-training-data'],
      },
    ],
  },
  {
    toolId: 'claude',
    name: 'Claude',
    category: 'llm',
    alternatives: ['chatgpt'],
    tiers: [
      {
        id: 'claude-pro',
        name: 'Claude Pro',
        billingCycle: 'monthly',
        pricePerSeat: 20,
        features: ['opus', 'sonnet', 'projects'],
      },
    ],
  },
  {
    toolId: 'midjourney',
    name: 'Midjourney',
    category: 'image-gen',
    alternatives: ['chatgpt'],
    tiers: [
      {
        id: 'midjourney-standard-monthly',
        name: 'Standard',
        billingCycle: 'monthly',
        pricePerSeat: 30,
        features: ['fast-gpu', 'relax-gpu'],
      },
      {
        id: 'midjourney-standard-annual',
        name: 'Standard',
        billingCycle: 'annual',
        pricePerSeat: 24,
        features: ['fast-gpu', 'relax-gpu'],
      },
    ],
  }
];
