import { Consent } from '../../../domain/entities';
import { createDomainEvent, EventTypes } from '../../../domain/events';
import { ScopeSet } from '../../../domain/value-objects';
import { type CreateConsentCommand, type CreateConsentResult } from '../../dto/consent.dto';
import { toConsentSummary } from '../../mappers';
import { type AuditPort } from '../../ports/audit.port';
import { type ClockPort } from '../../ports/clock.port';
import { type ConsentRepository } from '../../ports/consent.repository';
import { type IdGeneratorPort } from '../../ports/id-generator.port';
import { type UnitOfWorkPort } from '../../ports/unit-of-work.port';

export class CreateConsentUseCase {
  constructor(
    private readonly unitOfWork: UnitOfWorkPort,
    private readonly consentRepository: ConsentRepository,
    private readonly clock: ClockPort,
    private readonly idGenerator: IdGeneratorPort,
    private readonly audit: AuditPort,
  ) {}

  async execute(command: CreateConsentCommand): Promise<CreateConsentResult> {
    const now = this.clock.now();
    const requestedScopes = ScopeSet.fromString(command.requestedScopes);

    const consent = Consent.create({
      id: this.idGenerator.generate(),
      userId: command.userId,
      clientId: command.clientId,
      institutionId: command.institutionId,
      requestedScopes,
      purpose: command.purpose,
      expiresAt: command.expiresAt,
      now,
    });
    consent.submitForAuthorization(now);

    await this.unitOfWork.runInTransaction(async (ctx) => {
      await this.consentRepository.save(consent);
      ctx.addOutboxEvent(
        createDomainEvent({
          eventId: this.idGenerator.generate(),
          aggregateId: consent.id,
          aggregateType: 'Consent',
          eventType: EventTypes.CONSENT_CREATED,
          version: consent.version,
          timestamp: now,
          correlationId: command.correlationId,
          payload: {
            userId: consent.userId,
            clientId: consent.clientId,
            institutionId: consent.institutionId,
            requestedScopes: consent.requestedScopes.asString(),
            status: consent.status,
          },
        }),
      );
    });

    await this.audit.record({
      action: 'consent.created',
      actorId: command.userId,
      actorType: 'user',
      resourceType: 'Consent',
      resourceId: consent.id,
      institutionId: command.institutionId,
      metadata: { purpose: command.purpose },
      timestamp: now,
    });

    return { consent: toConsentSummary(consent) };
  }
}
