import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import { authorizationFailuresTotal } from '../../../observability/metrics';
import {
  AUTH_CONTEXT_KEY,
  REQUIRED_SCOPES_KEY,
  type AuthContext,
} from '../decorators/require-scopes.decorator';

@Injectable()
export class ScopesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredScopes = this.reflector.getAllAndOverride<string[] | undefined>(
      REQUIRED_SCOPES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (requiredScopes === undefined || requiredScopes.length === 0) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<FastifyRequest & Record<string, AuthContext>>();
    const auth = request[AUTH_CONTEXT_KEY];
    if (auth === undefined) {
      authorizationFailuresTotal.inc({ reason: 'missing_auth_context' });
      throw new ForbiddenException('Authentication required');
    }

    for (const scope of requiredScopes) {
      if (!auth.claims.scopes.contains(scope)) {
        authorizationFailuresTotal.inc({ reason: 'insufficient_scope' });
        throw new ForbiddenException(`Missing required scope: ${scope}`);
      }
    }

    return true;
  }
}
