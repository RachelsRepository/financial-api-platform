import { CanActivate, ExecutionContext, Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FastifyRequest } from 'fastify';
import { CONFIG_KEY, type AppConfig } from '../../../config/configuration';

@Injectable()
export class TrustedHostGuard implements CanActivate {
  private readonly allowedHosts: ReadonlySet<string>;

  constructor(configService: ConfigService) {
    const config = configService.getOrThrow<AppConfig>(CONFIG_KEY);
    this.allowedHosts = new Set(
      config.TRUSTED_HOSTS.split(',')
        .map((host) => host.trim().toLowerCase())
        .filter(Boolean),
    );
  }

  canActivate(context: ExecutionContext): boolean {
    if (this.allowedHosts.size === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const hostHeader = request.headers.host;
    if (typeof hostHeader !== 'string' || hostHeader.length === 0) {
      throw new BadRequestException('Host header required');
    }

    const hostname = hostHeader.split(':')[0]?.toLowerCase() ?? '';
    if (!this.allowedHosts.has(hostname)) {
      throw new BadRequestException(`Untrusted host: ${hostname}`);
    }
    return true;
  }
}
