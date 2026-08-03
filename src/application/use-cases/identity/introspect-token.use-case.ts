import { AuthorizationError } from '../../../domain/errors';
import { type IntrospectTokenCommand, type IntrospectTokenResult } from '../../dto/identity.dto';
import { type AccessTokenValidatorPort } from '../../ports/access-token-validator.port';
import { type ClientRepository } from '../../ports/client.repository';
import { type ClockPort } from '../../ports/clock.port';
import { type CryptoPort } from '../../ports/crypto.port';
import { type TokenRepository } from '../../ports/token.repository';

export class IntrospectTokenUseCase {
  constructor(
    private readonly clientRepository: ClientRepository,
    private readonly tokenRepository: TokenRepository,
    private readonly accessTokenValidator: AccessTokenValidatorPort,
    private readonly crypto: CryptoPort,
    private readonly clock: ClockPort,
  ) {}

  async execute(command: IntrospectTokenCommand): Promise<IntrospectTokenResult> {
    const client = await this.clientRepository.findByClientId(command.clientId);
    if (client === null || !client.isActive) {
      throw new AuthorizationError('Unknown or inactive client', 'invalid_client');
    }

    const inactive: IntrospectTokenResult = {
      active: false,
      scope: null,
      clientId: null,
      username: null,
      sub: null,
      exp: null,
      iat: null,
      consentId: null,
      institutionId: null,
    };

    const looksLikeJwt = command.token.split('.').length === 3;
    if (looksLikeJwt) {
      try {
        const verified = await this.accessTokenValidator.validateAccessToken(command.token);
        if (verified.clientId !== client.clientId) {
          return inactive;
        }
        const record = await this.tokenRepository.findAccessTokenByJti(verified.jti);
        if (record === null || record.revokedAt !== null) {
          return inactive;
        }
        const now = this.clock.now();
        if (record.expiresAt <= now) {
          return inactive;
        }
        return {
          active: true,
          scope: verified.scope,
          clientId: command.clientId,
          username: verified.userId,
          sub: verified.subject,
          exp: verified.expiresAtEpoch,
          iat: verified.issuedAtEpoch,
          consentId: verified.consentId,
          institutionId: verified.institutionId,
        };
      } catch {
        return inactive;
      }
    }

    const tokenHash = await this.crypto.hash(command.token);
    const family = await this.tokenRepository.findRefreshTokenFamilyByHash(tokenHash);
    if (family === null || family.clientId !== client.id) {
      return inactive;
    }
    const now = this.clock.now();
    if (family.revokedAt !== null || family.expiresAt <= now) {
      return inactive;
    }

    return {
      active: true,
      scope: family.scopes.asString(),
      clientId: command.clientId,
      username: family.userId,
      sub: family.userId,
      exp: Math.floor(family.expiresAt.getTime() / 1000),
      iat: Math.floor(family.createdAt.getTime() / 1000),
      consentId: family.consentId,
      institutionId: null,
    };
  }
}
