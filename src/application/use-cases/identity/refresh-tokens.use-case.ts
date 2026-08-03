import { isFamilyRevoked } from '../../../domain/entities';
import { createDomainEvent, EventTypes } from '../../../domain/events';
import { AuthorizationError, TokenError, TokenReuseDetectedError } from '../../../domain/errors';
import { ConsentStatus } from '../../../domain/policies/state-machines';
import { SCOPES } from '../../../domain/value-objects';
import { type RefreshTokensCommand, type RefreshTokensResult } from '../../dto/identity.dto';
import { type AccessTokenIssuerPort } from '../../ports/access-token-issuer.port';
import { type AuditPort } from '../../ports/audit.port';
import { type ClientRepository } from '../../ports/client.repository';
import { type ClockPort } from '../../ports/clock.port';
import { type ConsentRepository } from '../../ports/consent.repository';
import { type CryptoPort } from '../../ports/crypto.port';
import { type IdGeneratorPort } from '../../ports/id-generator.port';
import { type TokenRepository } from '../../ports/token.repository';
import { type UnitOfWorkPort } from '../../ports/unit-of-work.port';

const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export class RefreshTokensUseCase {
  constructor(
    private readonly unitOfWork: UnitOfWorkPort,
    private readonly clientRepository: ClientRepository,
    private readonly consentRepository: ConsentRepository,
    private readonly tokenRepository: TokenRepository,
    private readonly accessTokenIssuer: AccessTokenIssuerPort,
    private readonly crypto: CryptoPort,
    private readonly clock: ClockPort,
    private readonly idGenerator: IdGeneratorPort,
    private readonly audit: AuditPort,
  ) {}

  async execute(command: RefreshTokensCommand): Promise<RefreshTokensResult> {
    const client = await this.clientRepository.findByClientId(command.clientId);
    if (client === null || !client.isActive) {
      throw new AuthorizationError('Unknown or inactive client', 'invalid_client');
    }

    if (client.isConfidential) {
      if (command.clientSecret === null || client.clientSecretHash === null) {
        throw new AuthorizationError('Client authentication required', 'invalid_client');
      }
      const secretValid = await this.crypto.compare(command.clientSecret, client.clientSecretHash);
      if (!secretValid) {
        throw new AuthorizationError('Invalid client credentials', 'invalid_client');
      }
    }

    const refreshTokenHash = await this.crypto.hash(command.refreshToken);
    const family = await this.tokenRepository.findRefreshTokenFamilyByHash(refreshTokenHash);
    if (family === null) {
      throw new TokenError('Invalid refresh token', 'invalid_grant');
    }
    if (family.clientId !== client.id) {
      throw new TokenError('Refresh token client mismatch', 'invalid_grant');
    }

    const now = this.clock.now();

    if (isFamilyRevoked(family)) {
      await this.handleReuse(family.id, now, command.correlationId);
      throw new TokenReuseDetectedError(family.id);
    }

    if (family.expiresAt <= now) {
      throw new TokenError('Refresh token expired', 'invalid_grant');
    }

    const tokenMatches = await this.crypto.compare(command.refreshToken, family.currentTokenHash);

    if (!tokenMatches) {
      await this.handleReuse(family.id, now, command.correlationId);
      throw new TokenReuseDetectedError(family.id);
    }

    const consent = await this.consentRepository.findById(family.consentId);
    if (consent === null || consent.status !== ConsentStatus.ACTIVE) {
      throw new TokenError('Consent is not active', 'invalid_grant');
    }

    const issued = await this.accessTokenIssuer.issueAccessToken({
      subject: family.userId,
      clientId: client.clientId,
      scope: family.scopes.asString(),
      consentId: family.consentId,
      institutionId: consent.institutionId,
      userId: family.userId,
    });

    const newRefreshToken = this.generateOpaqueToken();
    const newRefreshHash = await this.crypto.hash(newRefreshToken);
    const tokenId = this.idGenerator.generate();
    const accessExpiresAt = new Date(now.getTime() + issued.expiresInSeconds * 1000);
    const refreshExpiresAt = new Date(now.getTime() + REFRESH_TOKEN_TTL_MS);
    const nextGeneration = family.generation + 1;

    await this.unitOfWork.runInTransaction(async (ctx) => {
      await this.tokenRepository.rotateRefreshToken(
        family.id,
        newRefreshHash,
        nextGeneration,
        refreshExpiresAt,
      );
      await this.tokenRepository.saveAccessToken({
        tokenId,
        tokenHash: issued.jti,
        clientId: client.id,
        userId: family.userId,
        consentId: family.consentId,
        institutionId: consent.institutionId,
        scopes: family.scopes,
        expiresAt: accessExpiresAt,
        revokedAt: null,
        createdAt: now,
      });
      ctx.addOutboxEvent(
        createDomainEvent({
          eventId: this.idGenerator.generate(),
          aggregateId: family.id,
          aggregateType: 'RefreshTokenFamily',
          eventType: EventTypes.TOKEN_ISSUED,
          version: nextGeneration,
          timestamp: now,
          correlationId: command.correlationId,
          payload: {
            clientId: client.clientId,
            consentId: family.consentId,
            generation: nextGeneration,
          },
        }),
      );
    });

    const includeRefresh = family.scopes.contains(SCOPES.OFFLINE_ACCESS);

    await this.audit.record({
      action: 'identity.token_refreshed',
      actorId: client.clientId,
      actorType: 'client',
      resourceType: 'RefreshTokenFamily',
      resourceId: family.id,
      institutionId: consent.institutionId,
      metadata: { generation: nextGeneration },
      timestamp: now,
    });

    return {
      accessToken: issued.accessToken,
      refreshToken: includeRefresh ? newRefreshToken : null,
      idToken: null,
      tokenType: 'Bearer',
      expiresIn: issued.expiresInSeconds,
      scope: family.scopes.asString(),
    };
  }

  private async handleReuse(
    familyId: string,
    now: Date,
    correlationId: string | undefined,
  ): Promise<void> {
    await this.unitOfWork.runInTransaction(async (ctx) => {
      await this.tokenRepository.markReuseDetected(familyId, now);
      await this.tokenRepository.revokeRefreshTokenFamily(familyId, now);
      ctx.addOutboxEvent(
        createDomainEvent({
          eventId: this.idGenerator.generate(),
          aggregateId: familyId,
          aggregateType: 'RefreshTokenFamily',
          eventType: EventTypes.TOKEN_REUSE_DETECTED,
          version: 1,
          timestamp: now,
          correlationId,
          payload: { familyId, revokedAt: now.toISOString() },
        }),
      );
      ctx.addOutboxEvent(
        createDomainEvent({
          eventId: this.idGenerator.generate(),
          aggregateId: familyId,
          aggregateType: 'RefreshTokenFamily',
          eventType: EventTypes.TOKEN_REVOKED,
          version: 1,
          timestamp: now,
          correlationId,
          payload: { reason: 'reuse_detected' },
        }),
      );
    });
  }

  private generateOpaqueToken(): string {
    return `${this.idGenerator.generate()}${this.idGenerator.generate()}`;
  }
}
