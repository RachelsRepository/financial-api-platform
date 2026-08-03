import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FastifyRequest } from 'fastify';
import { CONFIG_KEY, type AppConfig } from '../../../config/configuration';

/**
 * Representative mTLS boundary control.
 *
 * Full TLS client-certificate termination is expected at the edge (ALB/ingress).
 * When MTLS_REQUIRED=true, this guard accepts only requests that present a
 * verified client-certificate identity forwarded by trusted infrastructure via
 * `x-forwarded-client-cert` or `x-client-cert-verified: SUCCESS`.
 *
 * This is not end-to-end in-process mTLS; see docs/adr/008-mtls-trust-boundary.md.
 */
@Injectable()
export class MutualTlsGuard implements CanActivate {
  private readonly required: boolean;

  constructor(configService: ConfigService) {
    const config = configService.getOrThrow<AppConfig>(CONFIG_KEY);
    this.required = config.MTLS_REQUIRED;
  }

  canActivate(context: ExecutionContext): boolean {
    if (!this.required) {
      return true;
    }

    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const verified = request.headers['x-client-cert-verified'];
    const forwarded = request.headers['x-forwarded-client-cert'];
    const verifiedOk = typeof verified === 'string' && verified.toUpperCase() === 'SUCCESS';
    const hasForwardedCert = typeof forwarded === 'string' && forwarded.length > 0;

    if (!verifiedOk && !hasForwardedCert) {
      throw new ForbiddenException('Client certificate required');
    }
    return true;
  }
}
