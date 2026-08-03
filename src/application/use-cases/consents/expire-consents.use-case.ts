import { createDomainEvent, EventTypes } from '../../../domain/events';
import { isTerminalConsent } from '../../../domain/policies/state-machines';
import { type ExpireConsentsCommand, type ExpireConsentsResult } from '../../dto/consent.dto';
import { type ClockPort } from '../../ports/clock.port';
import { type ConsentRepository } from '../../ports/consent.repository';
import { type IdGeneratorPort } from '../../ports/id-generator.port';
import { type UnitOfWorkPort } from '../../ports/unit-of-work.port';

export class ExpireConsentsUseCase {
  constructor(
    private readonly unitOfWork: UnitOfWorkPort,
    private readonly consentRepository: ConsentRepository,
    private readonly clock: ClockPort,
    private readonly idGenerator: IdGeneratorPort,
  ) {}

  async execute(command: ExpireConsentsCommand): Promise<ExpireConsentsResult> {
    const now = this.clock.now();
    const candidates = await this.consentRepository.findExpirable(now, command.batchSize);

    const expiredConsentIds: string[] = [];

    for (const consent of candidates) {
      if (isTerminalConsent(consent.status)) {
        continue;
      }
      if (!consent.isExpired(now) && consent.expiresAt > now) {
        continue;
      }

      consent.expire(now);

      await this.unitOfWork.runInTransaction(async (ctx) => {
        await this.consentRepository.save(consent);
        ctx.addOutboxEvent(
          createDomainEvent({
            eventId: this.idGenerator.generate(),
            aggregateId: consent.id,
            aggregateType: 'Consent',
            eventType: EventTypes.CONSENT_EXPIRED,
            version: consent.version,
            timestamp: now,
            correlationId: command.correlationId,
            payload: { expiresAt: consent.expiresAt.toISOString() },
          }),
        );
      });

      expiredConsentIds.push(consent.id);
    }

    return {
      expiredCount: expiredConsentIds.length,
      expiredConsentIds,
    };
  }
}
