import { type RefreshTokenFamily } from '../../../domain/entities';
import { createDomainEvent, EventTypes } from '../../../domain/events';
import { AuthorizationError, TokenError } from '../../../domain/errors';
import { ConsentStatus } from '../../../domain/policies/state-machines';
import { SCOPES } from '../../../domain/value-objects';
import {
  type ExchangeAuthorizationCodeCommand,
  type ExchangeAuthorizationCodeResult,
} from '../../dto/identity.dto';
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

export class ExchangeAuthorizationCodeUseCase {
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

  async execute(
    command: ExchangeAuthorizationCodeCommand,
  ): Promise<ExchangeAuthorizationCodeResult> {
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

    const authCode = await this.tokenRepository.findAuthorizationCode(command.code);
    if (authCode === null) {
      throw new TokenError('Invalid authorization code', 'invalid_grant');
    }
    if (authCode.usedAt !== null) {
      throw new TokenError('Authorization code already used', 'invalid_grant');
    }

    const now = this.clock.now();
    if (authCode.expiresAt <= now) {
      throw new TokenError('Authorization code expired', 'invalid_grant');
    }
    if (authCode.clientId !== client.id) {
      throw new TokenError('Authorization code client mismatch', 'invalid_grant');
    }
    if (authCode.redirectUri !== command.redirectUri) {
      throw new TokenError('Redirect URI mismatch', 'invalid_grant');
    }

    const pkceRequired = client.requirePkce || authCode.codeChallenge !== null;
    if (pkceRequired) {
      if (
        authCode.codeChallenge === null ||
        command.codeVerifier === null ||
        !this.crypto.verifyPkce(
          command.codeVerifier,
          authCode.codeChallenge,
          authCode.codeChallengeMethod ?? 'S256',
        )
      ) {
        throw new TokenError('PKCE verification failed', 'invalid_grant');
      }
    }

    const consent = await this.consentRepository.findById(authCode.consentId);
    if (consent === null) {
      throw new TokenError('Consent not found', 'invalid_grant');
    }
    if (consent.status !== ConsentStatus.AUTHORIZED && consent.status !== ConsentStatus.ACTIVE) {
      throw new TokenError('Consent is not authorized', 'invalid_grant');
    }

    if (consent.status === ConsentStatus.AUTHORIZED) {
      consent.activate(now);
    }

    const scopes = authCode.scopes;
    const issued = await this.accessTokenIssuer.issueAccessToken({
      subject: authCode.userId,
      clientId: client.clientId,
      scope: scopes.asString(),
      consentId: consent.id,
      institutionId: consent.institutionId,
      userId: authCode.userId,
    });

    let idToken: string | null = null;
    if (scopes.contains(SCOPES.OPENID)) {
      idToken = await this.accessTokenIssuer.issueIdToken({
        subject: authCode.userId,
        clientId: client.clientId,
        scope: scopes.asString(),
        consentId: consent.id,
        institutionId: consent.institutionId,
        userId: authCode.userId,
        nonce: authCode.nonce ?? undefined,
      });
    }

    const refreshToken = this.generateOpaqueToken();
    const refreshTokenHash = await this.crypto.hash(refreshToken);
    const tokenId = this.idGenerator.generate();
    const familyId = this.idGenerator.generate();
    const accessExpiresAt = new Date(now.getTime() + issued.expiresInSeconds * 1000);
    const refreshExpiresAt = new Date(now.getTime() + REFRESH_TOKEN_TTL_MS);
    const includeRefresh = scopes.contains(SCOPES.OFFLINE_ACCESS);

    const family: RefreshTokenFamily = {
      id: familyId,
      clientId: client.id,
      userId: authCode.userId,
      consentId: consent.id,
      currentTokenHash: refreshTokenHash,
      scopes,
      expiresAt: refreshExpiresAt,
      revokedAt: null,
      reuseDetectedAt: null,
      generation: 1,
      createdAt: now,
    };

    await this.unitOfWork.runInTransaction(async (ctx) => {
      await this.consentRepository.save(consent);
      await this.tokenRepository.markAuthorizationCodeUsed(command.code, now);
      await this.tokenRepository.saveAccessToken({
        tokenId,
        tokenHash: issued.jti,
        clientId: client.id,
        userId: authCode.userId,
        consentId: consent.id,
        institutionId: consent.institutionId,
        scopes,
        expiresAt: accessExpiresAt,
        revokedAt: null,
        createdAt: now,
      });
      if (includeRefresh) {
        await this.tokenRepository.saveRefreshTokenFamily(family);
      }
      ctx.addOutboxEvent(
        createDomainEvent({
          eventId: this.idGenerator.generate(),
          aggregateId: consent.id,
          aggregateType: 'Consent',
          eventType: EventTypes.CONSENT_ACTIVATED,
          version: consent.version,
          timestamp: now,
          correlationId: command.correlationId,
          payload: { activatedVia: 'token_exchange' },
        }),
      );
      ctx.addOutboxEvent(
        createDomainEvent({
          eventId: this.idGenerator.generate(),
          aggregateId: tokenId,
          aggregateType: 'Token',
          eventType: EventTypes.TOKEN_ISSUED,
          version: 1,
          timestamp: now,
          correlationId: command.correlationId,
          payload: {
            clientId: client.clientId,
            consentId: consent.id,
            scopes: scopes.asString(),
          },
        }),
      );
    });

    await this.audit.record({
      action: 'identity.token_issued',
      actorId: client.clientId,
      actorType: 'client',
      resourceType: 'Token',
      resourceId: tokenId,
      institutionId: consent.institutionId,
      metadata: { grantType: 'authorization_code' },
      timestamp: now,
    });

    return {
      accessToken: issued.accessToken,
      refreshToken: includeRefresh ? refreshToken : null,
      idToken,
      tokenType: 'Bearer',
      expiresIn: issued.expiresInSeconds,
      scope: scopes.asString(),
      consentId: consent.id,
    };
  }

  private generateOpaqueToken(): string {
    return `${this.idGenerator.generate()}${this.idGenerator.generate()}`;
  }
}
