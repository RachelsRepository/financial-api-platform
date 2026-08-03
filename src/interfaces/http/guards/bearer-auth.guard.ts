import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FastifyRequest } from 'fastify';
import { TOKENS } from '../../../application/ports/tokens';
import type { TokenRepository } from '../../../application/ports/token.repository';
import { CONFIG_KEY, type AppConfig } from '../../../config/configuration';
import { ScopeSet } from '../../../domain/value-objects';
import { type TokenService } from '../../../infrastructure/identity/token.service';
import { authorizationFailuresTotal } from '../../../observability/metrics';
import { AUTH_CONTEXT_KEY } from '../constants';
import { type AuthContext } from '../decorators/current-auth.decorator';

@Injectable()
export class BearerAuthGuard implements CanActivate {
  constructor(
    @Inject(TOKENS.TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(TOKENS.TOKEN_REPOSITORY) private readonly tokenRepository: TokenRepository,
    private readonly configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<FastifyRequest & Record<string, AuthContext>>();
    const authorization = request.headers.authorization;

    if (typeof authorization !== 'string' || !authorization.startsWith('Bearer ')) {
      authorizationFailuresTotal.inc({ reason: 'missing_bearer' });
      throw new UnauthorizedException('Bearer token required');
    }

    const token = authorization.slice('Bearer '.length).trim();
    if (token.length === 0) {
      authorizationFailuresTotal.inc({ reason: 'empty_bearer' });
      throw new UnauthorizedException('Bearer token required');
    }

    try {
      const verified = await this.tokenService.validateAccessToken(token);
      const record = await this.tokenRepository.findAccessTokenByJti(verified.jti);
      if (record === null || record.revokedAt !== null) {
        authorizationFailuresTotal.inc({ reason: 'revoked_token' });
        throw new UnauthorizedException('Access token revoked or unknown');
      }

      const config = this.configService.getOrThrow<AppConfig>(CONFIG_KEY);
      const exp = typeof verified.payload.exp === 'number' ? verified.payload.exp : 0;
      const iat = typeof verified.payload.iat === 'number' ? verified.payload.iat : 0;

      const claims = {
        subject: verified.sub,
        clientId: verified.clientId,
        issuer: config.TOKEN_ISSUER,
        audience: config.TOKEN_AUDIENCE,
        scopes: ScopeSet.fromString(verified.scope),
        consentId: verified.consentId ?? null,
        institutionId: verified.institutionId ?? null,
        userId: verified.userId ?? null,
        tokenId: verified.jti,
        expiresAtEpoch: exp,
        issuedAtEpoch: iat,
      };

      if (claims.consentId === null) {
        authorizationFailuresTotal.inc({ reason: 'missing_consent' });
        throw new UnauthorizedException('Token missing consent_id claim');
      }

      request[AUTH_CONTEXT_KEY] = {
        claims,
        consentId: claims.consentId,
      };
      return true;
    } catch (error) {
      authorizationFailuresTotal.inc({ reason: 'invalid_token' });
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Invalid or expired access token');
    }
  }
}
