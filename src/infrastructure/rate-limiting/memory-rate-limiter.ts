export interface RateLimitResult {
  readonly allowed: boolean;
  readonly remaining: number;
  readonly resetAtMs: number;
  readonly retryAfterMs?: number;
}

export interface RateLimiter {
  consume(key: string, cost?: number): Promise<RateLimitResult>;
}

export interface MemoryRateLimiterOptions {
  readonly windowMs: number;
  readonly maxRequests: number;
}

interface BucketState {
  count: number;
  windowStartMs: number;
}

export class MemoryRateLimiter implements RateLimiter {
  private readonly buckets = new Map<string, BucketState>();

  constructor(private readonly options: MemoryRateLimiterOptions) {}

  consume(key: string, cost = 1): Promise<RateLimitResult> {
    const now = Date.now();
    const bucket = this.buckets.get(key) ?? { count: 0, windowStartMs: now };

    if (now - bucket.windowStartMs >= this.options.windowMs) {
      bucket.count = 0;
      bucket.windowStartMs = now;
    }

    const nextCount = bucket.count + cost;
    const resetAtMs = bucket.windowStartMs + this.options.windowMs;

    if (nextCount > this.options.maxRequests) {
      this.buckets.set(key, bucket);
      return Promise.resolve({
        allowed: false,
        remaining: 0,
        resetAtMs,
        retryAfterMs: Math.max(resetAtMs - now, 0),
      });
    }

    bucket.count = nextCount;
    this.buckets.set(key, bucket);

    return Promise.resolve({
      allowed: true,
      remaining: Math.max(this.options.maxRequests - bucket.count, 0),
      resetAtMs,
    });
  }

  clear(): void {
    this.buckets.clear();
  }
}
