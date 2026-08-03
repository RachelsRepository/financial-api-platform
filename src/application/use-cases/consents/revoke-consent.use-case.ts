import { createDomainEvent, EventTypes } from '../../../domain/events';
import { AuthorizationError } from '../../../domain/errors';
import { isTerminalConsent } from '../../../domain/policies/state-machines';
import { type RevokeConsentCommand, type RevokeConsentResult } from '../../dto/consent.dto';
import { toConsentSummary } from '../../mappers';
import { type AuditPort } from '../../ports/audit.port';
import { type ClockPort } from '../../ports/clock.port';
import { type ConsentRepository } from '../../ports/consent.repository';
import { type IdGeneratorPort } from '../../ports/id-generator.port';
import { type TokenRepository } from '../../ports/token.repository';
import { type UnitOfWorkPort } from '../../ports/unit-of-work.port';

export class RevokeConsentUseCase {
  constructor(
    private readonly unitOfWork: UnitOfWorkPort,
    private readonly consentRepository: ConsentRepository,
    private readonly tokenRepository: TokenRepository,
    private readonly clock: ClockPort,
    private readonly idGenerator: IdGeneratorPort,
    private readonly audit: AuditPort,
  ) {}

  async execute(command: RevokeConsentCommand): Promise<RevokeConsentResult> {
    const consent = await this.consentRepository.findById(command.consentId);
    if (consent === null) {
      throw new AuthorizationError(`Consent ${command.consentId} not found`, 'not_found');
    }
    if (consent.userId !== command.actorUserId) {
      throw new AuthorizationError('User cannot revoke this consent', 'forbidden');
    }
    if (isTerminalConsent(consent.status)) {
      throw new AuthorizationError(
        `Consent is already terminal (status=${consent.status})`,
        'invalid_state',
      );
    }

    const now = this.clock.now();
    consent.revoke(now);

    await this.unitOfWork.runInTransaction(async (ctx) => {
      await this.consentRepository.save(consent);
      await this.tokenRepository.revokeAccessTokensForConsent(consent.id, now);
      await this.tokenRepository.revokeRefreshTokenFamiliesForConsent(consent.id, now);
      ctx.addOutboxEvent(
        createDomainEvent({
          eventId: this.idGenerator.generate(),
          aggregateId: consent.id,
          aggregateType: 'Consent',
          eventType: EventTypes.CONSENT_REVOKED,
          version: consent.version,
          timestamp: now,
          correlationId: command.correlationId,
          payload: { revokedAt: now.toISOString() },
        }),
      );
    });

    await this.audit.record({
      action: 'consent.revoked',
      actorId: command.actorUserId,
      actorType: 'user',
      resourceType: 'Consent',
      resourceId: consent.id,
      institutionId: consent.institutionId,
      metadata: {},
      timestamp: now,
    });

    return { consent: toConsentSummary(consent) };
  }
}
