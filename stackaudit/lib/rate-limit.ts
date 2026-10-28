// Simple in-memory token-bucket rate limiter.
// NOT suitable for multi-instance deployments — use Redis in that case.
const buckets = new Map<string, { tokens: number; lastRefill: number }>();

const DEFAULT_MAX_TOKENS = 5;      // max burst
const DEFAULT_REFILL_RATE = 1;     // tokens per second

export function rateLimit(
  key: string,
  maxTokens = DEFAULT_MAX_TOKENS,
  refillRate = DEFAULT_REFILL_RATE
): boolean {
  const now = Date.now();
  let bucket = buckets.get(key);

  if (!bucket) {
    bucket = { tokens: maxTokens - 1, lastRefill: now };
    buckets.set(key, bucket);
    return true; // first request always allowed
  }

  const elapsed = (now - bucket.lastRefill) / 1000;
  bucket.tokens = Math.min(maxTokens, bucket.tokens + elapsed * refillRate);
  bucket.lastRefill = now;

  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    return true;
  }

  return false;
}
