import { createDomainEvent, EventTypes } from '../../../domain/events';
import { AuthorizationError } from '../../../domain/errors';
import { ConsentStatus } from '../../../domain/policies/state-machines';
import { ScopeSet } from '../../../domain/value-objects';
import { type AuthorizeConsentCommand, type AuthorizeConsentResult } from '../../dto/consent.dto';
import { toConsentSummary } from '../../mappers';
import { type AuditPort } from '../../ports/audit.port';
import { type ClockPort } from '../../ports/clock.port';
import { type ConsentRepository } from '../../ports/consent.repository';
import { type IdGeneratorPort } from '../../ports/id-generator.port';
import { type TokenRepository } from '../../ports/token.repository';
import { type UnitOfWorkPort } from '../../ports/unit-of-work.port';

const AUTH_CODE_TTL_MS = 10 * 60 * 1000;

export class AuthorizeConsentUseCase {
  constructor(
    private readonly unitOfWork: UnitOfWorkPort,
    private readonly consentRepository: ConsentRepository,
    private readonly tokenRepository: TokenRepository,
    private readonly clock: ClockPort,
    private readonly idGenerator: IdGeneratorPort,
    private readonly audit: AuditPort,
  ) {}

  async execute(command: AuthorizeConsentCommand): Promise<AuthorizeConsentResult> {
    const consent = await this.consentRepository.findById(command.consentId);
    if (consent === null) {
      throw new AuthorizationError(`Consent ${command.consentId} not found`, 'not_found');
    }
    if (consent.userId !== command.actorUserId) {
      throw new AuthorizationError('User cannot authorize this consent', 'forbidden');
    }
    if (consent.status !== ConsentStatus.AWAITING_AUTHORIZATION) {
      throw new AuthorizationError(
        `Consent is not awaiting authorization (status=${consent.status})`,
        'invalid_state',
      );
    }

    const authRequest = await this.tokenRepository.findOpenAuthorizationRequestByConsentId(
      consent.id,
    );
    if (authRequest === null) {
      throw new AuthorizationError('No open authorization request for consent', 'invalid_request');
    }

    const now = this.clock.now();
    if (authRequest.expiresAt <= now) {
      throw new AuthorizationError('Authorization request expired', 'invalid_request');
    }

    const grantedScopes = ScopeSet.fromString(command.grantedScopes);
    consent.authorize({
      accountIds: command.accountIds,
      grantedScopes,
      now,
    });

    const authorizationCode = this.idGenerator.generate();
    const codeExpiresAt = new Date(now.getTime() + AUTH_CODE_TTL_MS);

    await this.unitOfWork.runInTransaction(async (ctx) => {
      await this.consentRepository.save(consent);
      await this.tokenRepository.markAuthorizationRequestConsumed(authRequest.id, now);
      await this.tokenRepository.saveAuthorizationCode({
        code: authorizationCode,
        clientId: consent.clientId,
        userId: consent.userId,
        consentId: consent.id,
        redirectUri: authRequest.redirectUri,
        scopes: consent.grantedScopes ?? ScopeSet.empty(),
        codeChallenge: authRequest.codeChallenge,
        codeChallengeMethod: authRequest.codeChallengeMethod,
        nonce: authRequest.nonce,
        expiresAt: codeExpiresAt,
        usedAt: null,
        createdAt: now,
      });
      ctx.addOutboxEvent(
        createDomainEvent({
          eventId: this.idGenerator.generate(),
          aggregateId: consent.id,
          aggregateType: 'Consent',
          eventType: EventTypes.CONSENT_AUTHORIZED,
          version: consent.version,
          timestamp: now,
          correlationId: command.correlationId,
          payload: {
            authorizedAccountIds: [...consent.authorizedAccountIds],
            grantedScopes: consent.grantedScopes?.asString() ?? '',
          },
        }),
      );
    });

    await this.audit.record({
      action: 'consent.authorized',
      actorId: command.actorUserId,
      actorType: 'user',
      resourceType: 'Consent',
      resourceId: consent.id,
      institutionId: consent.institutionId,
      metadata: { accountCount: command.accountIds.length },
      timestamp: now,
    });

    return {
      consent: toConsentSummary(consent),
      authorizationCode,
    };
  }
}
