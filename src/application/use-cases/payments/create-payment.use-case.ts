import { Payment } from '../../../domain/entities';
import { createDomainEvent, EventTypes } from '../../../domain/events';
import { AuthorizationError, IdempotencyConflictError } from '../../../domain/errors';
import { Money, SCOPES } from '../../../domain/value-objects';
import { type CreatePaymentCommand, type CreatePaymentResult } from '../../dto/payment.dto';
import { toPaymentSummary } from '../../mappers';
import { type AuditPort } from '../../ports/audit.port';
import { type ClockPort } from '../../ports/clock.port';
import { type ConsentRepository } from '../../ports/consent.repository';
import { type IdGeneratorPort } from '../../ports/id-generator.port';
import { type InstitutionRepository } from '../../ports/institution.repository';
import { type PaymentRepository } from '../../ports/payment.repository';
import { type UnitOfWorkPort } from '../../ports/unit-of-work.port';
import { type AuthorizationDecisionService } from '../../services/authorization-decision.service';

export class CreatePaymentUseCase {
  constructor(
    private readonly unitOfWork: UnitOfWorkPort,
    private readonly consentRepository: ConsentRepository,
    private readonly paymentRepository: PaymentRepository,
    private readonly institutionRepository: InstitutionRepository,
    private readonly authorizationDecision: AuthorizationDecisionService,
    private readonly clock: ClockPort,
    private readonly idGenerator: IdGeneratorPort,
    private readonly audit: AuditPort,
  ) {}

  async execute(command: CreatePaymentCommand): Promise<CreatePaymentResult> {
    const consent = await this.consentRepository.findById(command.consentId);
    if (consent === null) {
      throw new AuthorizationError(`Consent ${command.consentId} not found`, 'not_found');
    }

    await this.authorizationDecision.requireAccountAccess({
      claims: command.claims,
      consent,
      requiredScope: SCOPES.PAYMENTS_WRITE,
      accountId: command.sourceAccountId,
    });

    if (command.idempotencyKey !== undefined) {
      const existing = await this.paymentRepository.findByIdempotencyKey(
        consent.clientId,
        command.idempotencyKey,
      );
      if (existing !== null) {
        return { payment: toPaymentSummary(existing) };
      }
    }

    const institution = await this.institutionRepository.findById(consent.institutionId);
    if (institution === null) {
      throw new AuthorizationError('Institution not found', 'not_found');
    }

    const now = this.clock.now();
    const amount = Money.of(command.amountMinor, command.currency);

    const payment = Payment.create({
      id: this.idGenerator.generate(),
      consentId: consent.id,
      clientId: consent.clientId,
      institutionId: consent.institutionId,
      userId: consent.userId,
      sourceAccountId: command.sourceAccountId,
      amount,
      creditorName: command.creditorName,
      creditorAccountRef: command.creditorAccountRef,
      reference: command.reference,
      providerCode: institution.providerCode,
      idempotencyKey: command.idempotencyKey,
      now,
    });
    payment.requestAuthorization(now);

    try {
      await this.unitOfWork.runInTransaction(async (ctx) => {
        await this.paymentRepository.save(payment);
        ctx.addOutboxEvent(
          createDomainEvent({
            eventId: this.idGenerator.generate(),
            aggregateId: payment.id,
            aggregateType: 'Payment',
            eventType: EventTypes.PAYMENT_CREATED,
            version: payment.version,
            timestamp: now,
            correlationId: command.correlationId,
            payload: {
              consentId: payment.consentId,
              amountMinor: payment.amount.amountMinor,
              currency: payment.amount.currency,
              status: payment.status,
            },
          }),
        );
      });
    } catch (error) {
      if (command.idempotencyKey !== undefined) {
        const raced = await this.paymentRepository.findByIdempotencyKey(
          consent.clientId,
          command.idempotencyKey,
        );
        if (raced !== null) {
          return { payment: toPaymentSummary(raced) };
        }
        throw new IdempotencyConflictError(command.idempotencyKey);
      }
      throw error;
    }

    await this.audit.record({
      action: 'payment.created',
      actorId: command.claims.clientId,
      actorType: 'client',
      resourceType: 'Payment',
      resourceId: payment.id,
      institutionId: consent.institutionId,
      metadata: { reference: command.reference },
      timestamp: now,
    });

    return { payment: toPaymentSummary(payment) };
  }
}
