import type Redis from 'ioredis';
import type {
  RateLimitResult,
  RateLimiter,
} from '@infrastructure/rate-limiting/memory-rate-limiter';

export interface RedisRateLimiterOptions {
  readonly windowMs: number;
  readonly maxRequests: number;
  readonly keyPrefix?: string;
}

const CONSUME_SCRIPT = `
local key = KEYS[1]
local windowMs = tonumber(ARGV[1])
local maxRequests = tonumber(ARGV[2])
local cost = tonumber(ARGV[3])
local now = tonumber(ARGV[4])

local current = redis.call('GET', key)
local count = 0
local windowStart = now

if current then
  local sep = string.find(current, ':')
  if sep then
    windowStart = tonumber(string.sub(current, 1, sep - 1))
    count = tonumber(string.sub(current, sep + 1))
  end
end

if now - windowStart >= windowMs then
  count = 0
  windowStart = now
end

local nextCount = count + cost
local resetAt = windowStart + windowMs

if nextCount > maxRequests then
  return {0, 0, resetAt, resetAt - now}
end

redis.call('SET', key, windowStart .. ':' .. nextCount, 'PX', windowMs)
local remaining = maxRequests - nextCount
return {1, remaining, resetAt, 0}
`;

export class RedisRateLimiter implements RateLimiter {
  private readonly redis: Redis;
  private readonly keyPrefix: string;

  constructor(redis: Redis, options: RedisRateLimiterOptions) {
    this.redis = redis;
    this.keyPrefix = options.keyPrefix ?? 'ratelimit';
    this.options = options;
  }

  private readonly options: RedisRateLimiterOptions;

  async consume(key: string, cost = 1): Promise<RateLimitResult> {
    const redisKey = `${this.keyPrefix}:${key}`;
    const now = Date.now();

    const result = (await this.redis.eval(
      CONSUME_SCRIPT,
      1,
      redisKey,
      this.options.windowMs,
      this.options.maxRequests,
      cost,
      now,
    )) as [number, number, number, number];

    const [allowedFlag, remaining, resetAtMs, retryAfterMs] = result;

    return {
      allowed: allowedFlag === 1,
      remaining,
      resetAtMs,
      retryAfterMs: retryAfterMs > 0 ? retryAfterMs : undefined,
    };
  }
}
