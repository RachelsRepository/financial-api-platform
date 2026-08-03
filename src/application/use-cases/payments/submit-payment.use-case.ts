import { createDomainEvent, EventTypes } from '../../../domain/events';
import { AuthorizationError } from '../../../domain/errors';
import { PaymentStatus } from '../../../domain/policies/state-machines';
import { type SubmitPaymentCommand, type SubmitPaymentResult } from '../../dto/payment.dto';
import { toPaymentSummary } from '../../mappers';
import { type AuditPort } from '../../ports/audit.port';
import { type ClockPort } from '../../ports/clock.port';
import { type ClientRepository } from '../../ports/client.repository';
import { type FinancialProviderPort } from '../../ports/provider.port';
import { type IdGeneratorPort } from '../../ports/id-generator.port';
import { type InstitutionRepository } from '../../ports/institution.repository';
import { type PaymentRepository } from '../../ports/payment.repository';
import { type UnitOfWorkPort } from '../../ports/unit-of-work.port';

export class SubmitPaymentUseCase {
  constructor(
    private readonly unitOfWork: UnitOfWorkPort,
    private readonly paymentRepository: PaymentRepository,
    private readonly clientRepository: ClientRepository,
    private readonly institutionRepository: InstitutionRepository,
    private readonly provider: FinancialProviderPort,
    private readonly clock: ClockPort,
    private readonly idGenerator: IdGeneratorPort,
    private readonly audit: AuditPort,
  ) {}

  async execute(command: SubmitPaymentCommand): Promise<SubmitPaymentResult> {
    const payment = await this.paymentRepository.findById(command.paymentId);
    if (payment === null) {
      throw new AuthorizationError(`Payment ${command.paymentId} not found`, 'not_found');
    }

    const client = await this.clientRepository.findById(payment.clientId);
    if (client === null || client.clientId !== command.actorClientId) {
      throw new AuthorizationError('Client cannot submit this payment', 'forbidden');
    }
    if (payment.status !== PaymentStatus.AUTHORIZED) {
      throw new AuthorizationError(
        `Payment must be authorized before submission (status=${payment.status})`,
        'invalid_state',
      );
    }

    const institution = await this.institutionRepository.findById(payment.institutionId);
    if (institution === null) {
      throw new AuthorizationError('Institution not found', 'not_found');
    }

    const providerResult = await this.provider.submitPayment({
      paymentId: payment.id,
      institutionCode: institution.code,
      providerCode: payment.providerCode,
      amount: payment.amount,
      sourceAccountRef: payment.sourceAccountId,
      creditorName: payment.creditorName,
      creditorAccountRef: payment.creditorAccountRef,
      reference: payment.reference,
    });

    const now = this.clock.now();
    payment.submit(providerResult.providerPaymentId, now);

    await this.unitOfWork.runInTransaction(async (ctx) => {
      await this.paymentRepository.save(payment);
      ctx.addOutboxEvent(
        createDomainEvent({
          eventId: this.idGenerator.generate(),
          aggregateId: payment.id,
          aggregateType: 'Payment',
          eventType: EventTypes.PAYMENT_SUBMITTED,
          version: payment.version,
          timestamp: now,
          correlationId: command.correlationId,
          payload: {
            providerPaymentId: providerResult.providerPaymentId,
            providerStatus: providerResult.normalizedStatus,
          },
        }),
      );
    });

    await this.audit.record({
      action: 'payment.submitted',
      actorId: command.actorClientId,
      actorType: 'client',
      resourceType: 'Payment',
      resourceId: payment.id,
      institutionId: payment.institutionId,
      metadata: { providerPaymentId: providerResult.providerPaymentId },
      timestamp: now,
    });

    return { payment: toPaymentSummary(payment) };
  }
}
