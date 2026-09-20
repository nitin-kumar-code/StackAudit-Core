import { CanonicalUsageEvent } from '../types';

export interface DecryptedCredentials {
  apiKey: string;
  organizationId?: string; // e.g., for OpenAI
}

export interface ProviderAdapter {
  providerName: string;

  /**
   * Validate that the credentials are correct and have the necessary permissions.
   */
  validateCredentials(credentials: DecryptedCredentials): Promise<boolean>;

  /**
   * Fetch usage data for the specified time range.
   * Resolves pagination and formats into CanonicalUsageEvent array.
   */
  fetchUsage(
    credentials: DecryptedCredentials,
    startTime: Date,
    endTime: Date
  ): Promise<CanonicalUsageEvent[]>;
}

export class ProviderAuthenticationError extends Error {
  constructor(provider: string, message: string) {
    super(`Authentication failed for ${provider}: ${message}`);
    this.name = 'ProviderAuthenticationError';
  }
}

export class ProviderRateLimitError extends Error {
  constructor(provider: string, message: string) {
    super(`Rate limit exceeded for ${provider}: ${message}`);
    this.name = 'ProviderRateLimitError';
  }
}

export class ProviderApiError extends Error {
  constructor(provider: string, message: string) {
    super(`API error from ${provider}: ${message}`);
    this.name = 'ProviderApiError';
  }
}
