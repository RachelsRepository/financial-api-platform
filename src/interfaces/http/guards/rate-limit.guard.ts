import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FastifyRequest } from 'fastify';
import { CONFIG_KEY, type AppConfig } from '../../../config/configuration';
import { MemoryRateLimiter } from '../../../infrastructure/rate-limiting/memory-rate-limiter';
import { RedisRateLimiter } from '../../../infrastructure/rate-limiting/redis-rate-limiter';
import { RedisService } from '../../../infrastructure/cache/redis/redis.service';
import { rateLimitRejectionsTotal } from '../../../observability/metrics';
import type { RateLimiter } from '../../../infrastructure/rate-limiting/memory-rate-limiter';

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly limiter: RateLimiter;
  private ready: Promise<void> | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly redis: RedisService,
  ) {
    const config = this.configService.getOrThrow<AppConfig>(CONFIG_KEY);
    if (config.NODE_ENV === 'test') {
      this.limiter = new MemoryRateLimiter({
        windowMs: config.RATE_LIMIT_WINDOW_MS,
        maxRequests: config.RATE_LIMIT_MAX,
      });
    } else {
      this.limiter = new RedisRateLimiter(this.redis.getClient(), {
        windowMs: config.RATE_LIMIT_WINDOW_MS,
        maxRequests: config.RATE_LIMIT_MAX,
        keyPrefix: 'fap:rl',
      });
      this.ready = this.redis.connect();
    }
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.ready !== null) {
      await this.ready;
    }

    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const path = request.url.split('?')[0] ?? '/';
    if (path.startsWith('/health') || path.startsWith('/metrics')) {
      return true;
    }

    const forwarded =
      typeof request.headers['x-forwarded-for'] === 'string'
        ? request.headers['x-forwarded-for'].split(',')[0]?.trim()
        : undefined;
    const clientKey = forwarded && forwarded.length > 0 ? forwarded : request.ip || 'unknown';

    const result = await this.limiter.consume(`ip:${clientKey}`);
    if (!result.allowed) {
      rateLimitRejectionsTotal.inc({ route: path });
      throw new HttpException('Rate limit exceeded', HttpStatus.TOO_MANY_REQUESTS);
    }
    return true;
  }
}
