import { createDomainEvent, EventTypes } from '../../../domain/events';
import { AuthorizationError } from '../../../domain/errors';
import { PaymentStatus } from '../../../domain/policies/state-machines';
import { type AuthorizePaymentCommand, type AuthorizePaymentResult } from '../../dto/payment.dto';
import { toPaymentSummary } from '../../mappers';
import { type AuditPort } from '../../ports/audit.port';
import { type ClockPort } from '../../ports/clock.port';
import { type IdGeneratorPort } from '../../ports/id-generator.port';
import { type PaymentRepository } from '../../ports/payment.repository';
import { type UnitOfWorkPort } from '../../ports/unit-of-work.port';

export class AuthorizePaymentUseCase {
  constructor(
    private readonly unitOfWork: UnitOfWorkPort,
    private readonly paymentRepository: PaymentRepository,
    private readonly clock: ClockPort,
    private readonly idGenerator: IdGeneratorPort,
    private readonly audit: AuditPort,
  ) {}

  async execute(command: AuthorizePaymentCommand): Promise<AuthorizePaymentResult> {
    const payment = await this.paymentRepository.findById(command.paymentId);
    if (payment === null) {
      throw new AuthorizationError(`Payment ${command.paymentId} not found`, 'not_found');
    }
    if (payment.userId !== command.actorUserId) {
      throw new AuthorizationError('User cannot authorize this payment', 'forbidden');
    }
    if (payment.status !== PaymentStatus.AWAITING_AUTHORIZATION) {
      throw new AuthorizationError(
        `Payment is not awaiting authorization (status=${payment.status})`,
        'invalid_state',
      );
    }

    const now = this.clock.now();
    payment.authorize(now);

    await this.unitOfWork.runInTransaction(async (ctx) => {
      await this.paymentRepository.save(payment);
      ctx.addOutboxEvent(
        createDomainEvent({
          eventId: this.idGenerator.generate(),
          aggregateId: payment.id,
          aggregateType: 'Payment',
          eventType: EventTypes.PAYMENT_AUTHORIZED,
          version: payment.version,
          timestamp: now,
          correlationId: command.correlationId,
          payload: { authorizedAt: now.toISOString() },
        }),
      );
    });

    await this.audit.record({
      action: 'payment.authorized',
      actorId: command.actorUserId,
      actorType: 'user',
      resourceType: 'Payment',
      resourceId: payment.id,
      institutionId: payment.institutionId,
      metadata: {},
      timestamp: now,
    });

    return { payment: toPaymentSummary(payment) };
  }
}
