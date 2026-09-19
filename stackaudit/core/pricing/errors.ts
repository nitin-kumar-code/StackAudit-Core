export class PricingNotFoundError extends Error {
  constructor(provider: string, model: string, timestamp: Date) {
    super(`No active pricing record found for provider '${provider}' model '${model}' at timestamp ${timestamp.toISOString()}`);
    this.name = 'PricingNotFoundError';
  }
}

export class AmbiguousPricingError extends Error {
  constructor(provider: string, model: string, timestamp: Date, matchedIds: string[]) {
    super(`Multiple active pricing records found for provider '${provider}' model '${model}' at timestamp ${timestamp.toISOString()}. Matches: ${matchedIds.join(', ')}`);
    this.name = 'AmbiguousPricingError';
  }
}

export class InvalidUsageError extends Error {
  constructor(message: string) {
    super(`Invalid usage data: ${message}`);
    this.name = 'InvalidUsageError';
  }
}

export class IncompletePricingError extends Error {
  constructor(message: string) {
    super(`Incomplete pricing data: ${message}`);
    this.name = 'IncompletePricingError';
  }
}
