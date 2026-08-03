import { createDomainEvent, EventTypes } from '../../../domain/events';
import { AuthorizationError } from '../../../domain/errors';
import { isCancellable } from '../../../domain/policies/state-machines';
import { SCOPES } from '../../../domain/value-objects';
import { type CancelPaymentCommand, type CancelPaymentResult } from '../../dto/payment.dto';
import { toPaymentSummary } from '../../mappers';
import { type AuditPort } from '../../ports/audit.port';
import { type ClockPort } from '../../ports/clock.port';
import { type ConsentRepository } from '../../ports/consent.repository';
import { type IdGeneratorPort } from '../../ports/id-generator.port';
import { type PaymentRepository } from '../../ports/payment.repository';
import { type UnitOfWorkPort } from '../../ports/unit-of-work.port';
import { type AuthorizationDecisionService } from '../../services/authorization-decision.service';

export class CancelPaymentUseCase {
  constructor(
    private readonly unitOfWork: UnitOfWorkPort,
    private readonly consentRepository: ConsentRepository,
    private readonly paymentRepository: PaymentRepository,
    private readonly authorizationDecision: AuthorizationDecisionService,
    private readonly clock: ClockPort,
    private readonly idGenerator: IdGeneratorPort,
    private readonly audit: AuditPort,
  ) {}

  async execute(command: CancelPaymentCommand): Promise<CancelPaymentResult> {
    const payment = await this.paymentRepository.findById(command.paymentId);
    if (payment === null) {
      throw new AuthorizationError(`Payment ${command.paymentId} not found`, 'not_found');
    }

    const consent = await this.consentRepository.findById(payment.consentId);
    if (consent === null) {
      throw new AuthorizationError(`Consent ${payment.consentId} not found`, 'not_found');
    }

    await this.authorizationDecision.requireAccountAccess({
      claims: command.claims,
      consent,
      requiredScope: SCOPES.PAYMENTS_WRITE,
      accountId: payment.sourceAccountId,
    });

    if (!isCancellable(payment.status)) {
      throw new AuthorizationError(
        `Payment cannot be cancelled (status=${payment.status})`,
        'invalid_state',
      );
    }

    const now = this.clock.now();
    payment.cancel(now);

    await this.unitOfWork.runInTransaction(async (ctx) => {
      await this.paymentRepository.save(payment);
      ctx.addOutboxEvent(
        createDomainEvent({
          eventId: this.idGenerator.generate(),
          aggregateId: payment.id,
          aggregateType: 'Payment',
          eventType: EventTypes.PAYMENT_STATUS_CHANGED,
          version: payment.version,
          timestamp: now,
          correlationId: command.correlationId,
          payload: { status: payment.status, cancelledAt: now.toISOString() },
        }),
      );
    });

    await this.audit.record({
      action: 'payment.cancelled',
      actorId: command.claims.clientId,
      actorType: 'client',
      resourceType: 'Payment',
      resourceId: payment.id,
      institutionId: payment.institutionId,
      metadata: {},
      timestamp: now,
    });

    return { payment: toPaymentSummary(payment) };
  }
}
