import { createDomainEvent, EventTypes } from '../../../domain/events';
import { AuthorizationError, TokenError } from '../../../domain/errors';
import { type RevokeTokenCommand, type RevokeTokenResult } from '../../dto/identity.dto';
import { type AccessTokenValidatorPort } from '../../ports/access-token-validator.port';
import { type AuditPort } from '../../ports/audit.port';
import { type ClientRepository } from '../../ports/client.repository';
import { type ClockPort } from '../../ports/clock.port';
import { type CryptoPort } from '../../ports/crypto.port';
import { type IdGeneratorPort } from '../../ports/id-generator.port';
import { type TokenRepository } from '../../ports/token.repository';
import { type UnitOfWorkPort } from '../../ports/unit-of-work.port';

export class RevokeTokenUseCase {
  constructor(
    private readonly unitOfWork: UnitOfWorkPort,
    private readonly clientRepository: ClientRepository,
    private readonly tokenRepository: TokenRepository,
    private readonly accessTokenValidator: AccessTokenValidatorPort,
    private readonly crypto: CryptoPort,
    private readonly clock: ClockPort,
    private readonly idGenerator: IdGeneratorPort,
    private readonly audit: AuditPort,
  ) {}

  async execute(command: RevokeTokenCommand): Promise<RevokeTokenResult> {
    const client = await this.clientRepository.findByClientId(command.clientId);
    if (client === null || !client.isActive) {
      throw new AuthorizationError('Unknown or inactive client', 'invalid_client');
    }

    const now = this.clock.now();
    const looksLikeJwt = command.token.split('.').length === 3;

    if (
      !looksLikeJwt &&
      (command.tokenTypeHint === 'refresh_token' || command.tokenTypeHint === undefined)
    ) {
      const tokenHash = await this.crypto.hash(command.token);
      const family = await this.tokenRepository.findRefreshTokenFamilyByHash(tokenHash);
      if (family !== null && family.clientId === client.id) {
        await this.unitOfWork.runInTransaction(async (ctx) => {
          await this.tokenRepository.revokeRefreshTokenFamily(family.id, now);
          ctx.addOutboxEvent(
            createDomainEvent({
              eventId: this.idGenerator.generate(),
              aggregateId: family.id,
              aggregateType: 'RefreshTokenFamily',
              eventType: EventTypes.TOKEN_REVOKED,
              version: 1,
              timestamp: now,
              correlationId: command.correlationId,
              payload: { reason: 'client_revoke' },
            }),
          );
        });

        await this.audit.record({
          action: 'identity.refresh_token_revoked',
          actorId: client.clientId,
          actorType: 'client',
          resourceType: 'RefreshTokenFamily',
          resourceId: family.id,
          institutionId: null,
          metadata: {},
          timestamp: now,
        });

        return { revoked: true };
      }
    }

    if (command.tokenTypeHint === 'access_token' || command.tokenTypeHint === undefined) {
      let accessToken = !looksLikeJwt
        ? await this.tokenRepository.findAccessTokenByHash(await this.crypto.hash(command.token))
        : null;

      if (looksLikeJwt) {
        try {
          const verified = await this.accessTokenValidator.validateAccessToken(command.token);
          if (verified.clientId === client.clientId) {
            accessToken = await this.tokenRepository.findAccessTokenByJti(verified.jti);
          }
        } catch {
          accessToken = null;
        }
      }

      if (accessToken !== null && accessToken.clientId === client.id) {
        await this.unitOfWork.runInTransaction(async (ctx) => {
          await this.tokenRepository.revokeAccessToken(accessToken.tokenId, now);
          ctx.addOutboxEvent(
            createDomainEvent({
              eventId: this.idGenerator.generate(),
              aggregateId: accessToken.tokenId,
              aggregateType: 'AccessToken',
              eventType: EventTypes.TOKEN_REVOKED,
              version: 1,
              timestamp: now,
              correlationId: command.correlationId,
              payload: { reason: 'client_revoke' },
            }),
          );
        });

        await this.audit.record({
          action: 'identity.access_token_revoked',
          actorId: client.clientId,
          actorType: 'client',
          resourceType: 'AccessToken',
          resourceId: accessToken.tokenId,
          institutionId: accessToken.institutionId,
          metadata: {},
          timestamp: now,
        });

        return { revoked: true };
      }
    }

    throw new TokenError('Token not found or not owned by client', 'invalid_token');
  }
}
