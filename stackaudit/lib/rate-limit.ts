// Simple in-memory token-bucket rate limiter.
// NOT suitable for multi-instance deployments — use Redis in that case.
const buckets = new Map<string, { tokens: number; lastRefill: number }>();

const DEFAULT_MAX_TOKENS = 5;      // max burst
const DEFAULT_REFILL_RATE = 1;     // tokens per second
const MAX_BUCKET_ENTRIES = 10_000;
const BUCKET_TTL_MS = 60 * 60 * 1000; // 1 hour

function cleanupBuckets(now: number): void {
  if (buckets.size <= MAX_BUCKET_ENTRIES) return;
  for (const [key, b] of buckets.entries()) {
    if (now - b.lastRefill > BUCKET_TTL_MS) {
      buckets.delete(key);
    }
  }
  // If still over capacity after TTL purge, prune oldest entries
  if (buckets.size > MAX_BUCKET_ENTRIES) {
    const toDelete = buckets.size - MAX_BUCKET_ENTRIES;
    let deleted = 0;
    for (const key of buckets.keys()) {
      if (deleted >= toDelete) break;
      buckets.delete(key);
      deleted++;
    }
  }
}

export function resetRateLimitBuckets(): void {
  buckets.clear();
}

export function rateLimit(
  key: string,
  maxTokens = DEFAULT_MAX_TOKENS,
  refillRate = DEFAULT_REFILL_RATE
): boolean {
  const now = Date.now();
  cleanupBuckets(now);
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
