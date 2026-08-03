import { createDomainEvent, EventTypes } from '../../../domain/events';
import { AuthorizationError } from '../../../domain/errors';
import { ConsentStatus } from '../../../domain/policies/state-machines';
import { type ActivateConsentCommand, type ActivateConsentResult } from '../../dto/consent.dto';
import { toConsentSummary } from '../../mappers';
import { type AuditPort } from '../../ports/audit.port';
import { type ClockPort } from '../../ports/clock.port';
import { type ConsentRepository } from '../../ports/consent.repository';
import { type IdGeneratorPort } from '../../ports/id-generator.port';
import { type UnitOfWorkPort } from '../../ports/unit-of-work.port';

export class ActivateConsentUseCase {
  constructor(
    private readonly unitOfWork: UnitOfWorkPort,
    private readonly consentRepository: ConsentRepository,
    private readonly clock: ClockPort,
    private readonly idGenerator: IdGeneratorPort,
    private readonly audit: AuditPort,
  ) {}

  async execute(command: ActivateConsentCommand): Promise<ActivateConsentResult> {
    const consent = await this.consentRepository.findById(command.consentId);
    if (consent === null) {
      throw new AuthorizationError(`Consent ${command.consentId} not found`, 'not_found');
    }
    if (consent.userId !== command.actorUserId) {
      throw new AuthorizationError('User cannot activate this consent', 'forbidden');
    }
    if (consent.status !== ConsentStatus.AUTHORIZED) {
      throw new AuthorizationError(
        `Consent must be authorized before activation (status=${consent.status})`,
        'invalid_state',
      );
    }

    const now = this.clock.now();
    consent.activate(now);

    await this.unitOfWork.runInTransaction(async (ctx) => {
      await this.consentRepository.save(consent);
      ctx.addOutboxEvent(
        createDomainEvent({
          eventId: this.idGenerator.generate(),
          aggregateId: consent.id,
          aggregateType: 'Consent',
          eventType: EventTypes.CONSENT_ACTIVATED,
          version: consent.version,
          timestamp: now,
          correlationId: command.correlationId,
          payload: { activatedAt: now.toISOString() },
        }),
      );
    });

    await this.audit.record({
      action: 'consent.activated',
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
