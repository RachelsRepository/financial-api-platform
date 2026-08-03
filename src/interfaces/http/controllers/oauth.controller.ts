import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { CreateAuthorizationRequestUseCase } from '../../../application/use-cases/identity/create-authorization-request.use-case';
import { ExchangeAuthorizationCodeUseCase } from '../../../application/use-cases/identity/exchange-authorization-code.use-case';
import { IntrospectTokenUseCase } from '../../../application/use-cases/identity/introspect-token.use-case';
import { RefreshTokensUseCase } from '../../../application/use-cases/identity/refresh-tokens.use-case';
import { RevokeTokenUseCase } from '../../../application/use-cases/identity/revoke-token.use-case';
import {
  refreshReuseDetectedTotal,
  tokenRefreshFailuresTotal,
  tokensIssuedTotal,
} from '../../../observability/metrics';
import { TokenError, TokenReuseDetectedError } from '../../../domain/errors';
import {
  OAuthAuthorizeQueryDto,
  OAuthIntrospectRequestDto,
  OAuthRevokeRequestDto,
  OAuthTokenRequestDto,
} from '../dto/oauth.request.dto';
import { getCorrelationId } from '../middleware/correlation-id.middleware';

@ApiTags('OAuth')
@Controller('oauth')
export class OAuthController {
  constructor(
    private readonly createAuthorizationRequest: CreateAuthorizationRequestUseCase,
    private readonly exchangeAuthorizationCode: ExchangeAuthorizationCodeUseCase,
    private readonly refreshTokens: RefreshTokensUseCase,
    private readonly revokeToken: RevokeTokenUseCase,
    private readonly introspectToken: IntrospectTokenUseCase,
  ) {}

  @Get('authorize')
  @ApiOperation({ summary: 'Create an OAuth 2.1 authorization request (consent bootstrap)' })
  @ApiHeader({
    name: 'X-Correlation-Id',
    required: false,
    description: 'End-to-end correlation identifier',
  })
  async authorize(@Query() query: OAuthAuthorizeQueryDto, @Req() request: FastifyRequest) {
    return this.createAuthorizationRequest.execute({
      clientId: query.client_id,
      redirectUri: query.redirect_uri,
      scopes: query.scope,
      state: query.state,
      codeChallenge: query.code_challenge ?? null,
      codeChallengeMethod: query.code_challenge_method ?? null,
      nonce: query.nonce ?? null,
      userId: query.user_id,
      institutionId: query.institution_id,
      purpose: query.purpose,
      correlationId: getCorrelationId(request),
    });
  }

  @Post('token')
  @ApiOperation({ summary: 'Exchange authorization code or refresh token' })
  @ApiHeader({ name: 'X-Correlation-Id', required: false })
  async token(@Body() body: OAuthTokenRequestDto, @Req() request: FastifyRequest) {
    const correlationId = getCorrelationId(request);

    if (body.grant_type === 'authorization_code') {
      if (!body.code || !body.redirect_uri) {
        tokenRefreshFailuresTotal.inc({ reason: 'invalid_grant' });
        throw new TokenError(
          'code and redirect_uri are required for authorization_code grant',
          'invalid_grant',
        );
      }

      const result = await this.exchangeAuthorizationCode.execute({
        clientId: body.client_id,
        clientSecret: body.client_secret ?? null,
        code: body.code,
        redirectUri: body.redirect_uri,
        codeVerifier: body.code_verifier ?? null,
        correlationId,
      });
      tokensIssuedTotal.inc();
      return result;
    }

    if (!body.refresh_token) {
      tokenRefreshFailuresTotal.inc({ reason: 'invalid_grant' });
      throw new TokenError('refresh_token is required for refresh_token grant', 'invalid_grant');
    }

    try {
      const result = await this.refreshTokens.execute({
        clientId: body.client_id,
        clientSecret: body.client_secret ?? null,
        refreshToken: body.refresh_token,
        correlationId,
      });
      tokensIssuedTotal.inc();
      return result;
    } catch (error) {
      if (error instanceof TokenReuseDetectedError) {
        refreshReuseDetectedTotal.inc();
      }
      tokenRefreshFailuresTotal.inc({ reason: 'refresh_failed' });
      throw error;
    }
  }

  @Post('revoke')
  @ApiOperation({ summary: 'Revoke an access or refresh token' })
  @ApiHeader({ name: 'X-Correlation-Id', required: false })
  async revoke(@Body() body: OAuthRevokeRequestDto, @Req() request: FastifyRequest) {
    return this.revokeToken.execute({
      token: body.token,
      tokenTypeHint: body.token_type_hint,
      clientId: body.client_id,
      correlationId: getCorrelationId(request),
    });
  }

  @Post('introspect')
  @ApiOperation({ summary: 'Introspect token active state and metadata' })
  async introspect(@Body() body: OAuthIntrospectRequestDto) {
    return this.introspectToken.execute({
      token: body.token,
      clientId: body.client_id,
    });
  }
}
