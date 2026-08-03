import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { type TokenClaims } from '../../../domain/policies/access-policy';
import { AUTH_CONTEXT_KEY } from '../constants';

export const REQUIRED_SCOPES_KEY = 'requiredScopes';

export const RequireScopes = (...scopes: string[]) => SetMetadata(REQUIRED_SCOPES_KEY, scopes);

export interface AuthContext {
  claims: TokenClaims;
  consentId: string;
}

export const CurrentAuth = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthContext => {
    const request = context
      .switchToHttp()
      .getRequest<FastifyRequest & Record<string, AuthContext>>();
    const auth = request[AUTH_CONTEXT_KEY];
    if (auth === undefined) {
      throw new Error('Auth context missing — ensure BearerAuthGuard is applied');
    }
    return auth;
  },
);

export const CurrentClaims = createParamDecorator(
  (_data: unknown, context: ExecutionContext): TokenClaims => {
    const request = context
      .switchToHttp()
      .getRequest<FastifyRequest & Record<string, AuthContext>>();
    const auth = request[AUTH_CONTEXT_KEY];
    if (auth === undefined) {
      throw new Error('Auth context missing — ensure BearerAuthGuard is applied');
    }
    return auth.claims;
  },
);
