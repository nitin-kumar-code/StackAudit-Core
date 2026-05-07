export interface PricingPlan {
  id: string;
  name: string;
  pricePerSeatMonthly: number;
  pricePerSeatAnnual?: number; // Monthly equivalent when billed annually
  minimumSeats: number;
}

export interface ToolData {
  id: string;
  name: string;
  category: 'coding' | 'chat' | 'api' | 'other';
  plans: Record<string, PricingPlan>;
  alternatives: string[]; // Tool names
}

export const TOOL_PRICING: Record<string, ToolData> = {
  'Cursor': {
    id: 'cursor',
    name: 'Cursor',
    category: 'coding',
    plans: {
      'pro': { id: 'pro', name: 'Pro', pricePerSeatMonthly: 20, pricePerSeatAnnual: 16, minimumSeats: 1 },
      'business': { id: 'business', name: 'Business', pricePerSeatMonthly: 40, pricePerSeatAnnual: 40, minimumSeats: 1 },
      'enterprise': { id: 'enterprise', name: 'Enterprise', pricePerSeatMonthly: 0, minimumSeats: 100 }, // Custom pricing
    },
    alternatives: ['GitHub Copilot', 'Windsurf']
  },
  'Windsurf': {
    id: 'windsurf',
    name: 'Windsurf',
    category: 'coding',
    plans: {
      'pro': { id: 'pro', name: 'Pro', pricePerSeatMonthly: 15, minimumSeats: 1 },
      'team': { id: 'team', name: 'Team', pricePerSeatMonthly: 25, minimumSeats: 5 },
    },
    alternatives: ['Cursor', 'GitHub Copilot']
  },
  'GitHub Copilot': {
    id: 'github-copilot',
    name: 'GitHub Copilot',
    category: 'coding',
    plans: {
      'individual': { id: 'individual', name: 'Individual', pricePerSeatMonthly: 10, pricePerSeatAnnual: 8.33, minimumSeats: 1 },
      'business': { id: 'business', name: 'Business', pricePerSeatMonthly: 19, minimumSeats: 1 },
      'enterprise': { id: 'enterprise', name: 'Enterprise', pricePerSeatMonthly: 39, minimumSeats: 1 },
    },
    alternatives: ['Cursor', 'Windsurf']
  },
  'ChatGPT': {
    id: 'chatgpt',
    name: 'ChatGPT',
    category: 'chat',
    plans: {
      'plus': { id: 'plus', name: 'Plus', pricePerSeatMonthly: 20, minimumSeats: 1 },
      'team': { id: 'team', name: 'Team', pricePerSeatMonthly: 30, pricePerSeatAnnual: 25, minimumSeats: 2 },
      'enterprise': { id: 'enterprise', name: 'Enterprise', pricePerSeatMonthly: 60, pricePerSeatAnnual: 60, minimumSeats: 150 }, // Estimated
    },
    alternatives: ['Claude', 'Gemini']
  },
  'Claude': {
    id: 'claude',
    name: 'Claude',
    category: 'chat',
    plans: {
      'pro': { id: 'pro', name: 'Pro', pricePerSeatMonthly: 20, minimumSeats: 1 },
      'team': { id: 'team', name: 'Team', pricePerSeatMonthly: 30, pricePerSeatAnnual: 30, minimumSeats: 5 },
      'enterprise': { id: 'enterprise', name: 'Enterprise', pricePerSeatMonthly: 0, minimumSeats: 100 },
    },
    alternatives: ['ChatGPT', 'Gemini']
  },
  'Gemini': {
    id: 'gemini',
    name: 'Gemini',
    category: 'chat',
    plans: {
      'advanced': { id: 'advanced', name: 'Advanced', pricePerSeatMonthly: 20, minimumSeats: 1 },
      'business': { id: 'business', name: 'Business', pricePerSeatMonthly: 30, pricePerSeatAnnual: 24, minimumSeats: 1 },
      'enterprise': { id: 'enterprise', name: 'Enterprise', pricePerSeatMonthly: 0, minimumSeats: 100 },
    },
    alternatives: ['ChatGPT', 'Claude']
  },
  'OpenAI API': {
    id: 'openai-api',
    name: 'OpenAI API',
    category: 'api',
    plans: {
      'pay-as-you-go': { id: 'pay-as-you-go', name: 'Pay as you go', pricePerSeatMonthly: 0, minimumSeats: 1 },
    },
    alternatives: ['Anthropic API']
  },
  'Anthropic API': {
    id: 'anthropic-api',
    name: 'Anthropic API',
    category: 'api',
    plans: {
      'pay-as-you-go': { id: 'pay-as-you-go', name: 'Pay as you go', pricePerSeatMonthly: 0, minimumSeats: 1 },
    },
    alternatives: ['OpenAI API']
  }
};
