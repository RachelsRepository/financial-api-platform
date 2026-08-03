import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { TOKENS } from '../../../application/ports/tokens';
import { CONFIG_KEY, type AppConfig } from '../../../config/configuration';
import { buildOidcDiscoveryDocument } from '../../../infrastructure/identity/oidc-discovery';
import { type TokenService } from '../../../infrastructure/identity/token.service';
import { CurrentClaims, RequireScopes } from '../decorators/current-auth.decorator';
import { type TokenClaims } from '../../../domain/policies/access-policy';
import { SCOPES } from '../../../domain/value-objects';
import { BearerAuthGuard } from '../guards/bearer-auth.guard';
import { ScopesGuard } from '../guards/scopes.guard';

@ApiTags('OpenID Connect')
@Controller()
export class OidcController {
  private readonly config: AppConfig;

  constructor(
    @Inject(TOKENS.TOKEN_SERVICE) private readonly tokenService: TokenService,
    configService: ConfigService,
  ) {
    this.config = configService.getOrThrow<AppConfig>(CONFIG_KEY);
  }

  @Get('.well-known/openid-configuration')
  @ApiOperation({ summary: 'OpenID Provider configuration' })
  discovery() {
    const issuer = this.config.TOKEN_ISSUER.replace(/\/$/, '');
    return buildOidcDiscoveryDocument({
      issuer,
      authorizationEndpoint: `${issuer}/oauth/authorize`,
      tokenEndpoint: `${issuer}/oauth/token`,
      userinfoEndpoint: `${issuer}/userinfo`,
      jwksUri: `${issuer}/jwks`,
    });
  }

  @Get('jwks')
  @ApiOperation({ summary: 'JSON Web Key Set' })
  async jwks() {
    return this.tokenService.exportJwks();
  }

  @Get('userinfo')
  @ApiBearerAuth()
  @UseGuards(BearerAuthGuard, ScopesGuard)
  @RequireScopes(SCOPES.OPENID)
  @ApiOperation({ summary: 'OpenID Connect UserInfo (optional)' })
  userinfo(@CurrentClaims() claims: TokenClaims) {
    return {
      sub: claims.subject,
      client_id: claims.clientId,
      scope: claims.scopes.asString(),
      consent_id: claims.consentId,
      institution_id: claims.institutionId,
      user_id: claims.userId,
    };
  }
}
