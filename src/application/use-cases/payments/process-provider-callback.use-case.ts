import { createDomainEvent, EventTypes } from '../../../domain/events';
import { AuthorizationError } from '../../../domain/errors';
import { PROVIDER_STATUS_MAP } from '../../../domain/policies/state-machines';
import {
  type ProcessProviderCallbackCommand,
  type ProcessProviderCallbackResult,
} from '../../dto/payment.dto';
import { type ClockPort } from '../../ports/clock.port';
import { type CryptoPort } from '../../ports/crypto.port';
import { type IdGeneratorPort } from '../../ports/id-generator.port';
import { type PaymentRepository } from '../../ports/payment.repository';
import { type ProviderCallbackRepository } from '../../ports/provider-callback.repository';
import { type FinancialProviderPort } from '../../ports/provider.port';
import { type UnitOfWorkPort } from '../../ports/unit-of-work.port';

export class ProcessProviderCallbackUseCase {
  constructor(
    private readonly unitOfWork: UnitOfWorkPort,
    private readonly paymentRepository: PaymentRepository,
    private readonly providerCallbackRepository: ProviderCallbackRepository,
    private readonly provider: FinancialProviderPort,
    private readonly crypto: CryptoPort,
    private readonly clock: ClockPort,
    private readonly idGenerator: IdGeneratorPort,
  ) {}

  async execute(command: ProcessProviderCallbackCommand): Promise<ProcessProviderCallbackResult> {
    const verification = await this.provider.verifyWebhook(
      command.providerCode,
      command.headers,
      command.body,
    );

    if (!verification.valid || verification.providerPaymentId === null) {
      return { paymentId: '', status: 'ignored', processed: false };
    }

    const eventId = verification.eventId;
    if (eventId === null || eventId.length === 0) {
      return { paymentId: '', status: 'ignored', processed: false };
    }

    const existing = await this.providerCallbackRepository.findByProviderEvent(
      command.providerCode,
      eventId,
    );
    if (existing !== null && existing.processedAt !== null) {
      return {
        paymentId: existing.paymentId ?? '',
        status: 'duplicate',
        processed: false,
      };
    }

    const payment = await this.paymentRepository.findByProviderPaymentId(
      verification.providerPaymentId,
    );
    if (payment === null) {
      throw new AuthorizationError(
        `Payment for provider id ${verification.providerPaymentId} not found`,
        'not_found',
      );
    }

    const normalizedStatus = verification.normalizedStatus ?? 'pending';
    const targetStatus = PROVIDER_STATUS_MAP[normalizedStatus];
    if (targetStatus === undefined) {
      return {
        paymentId: payment.id,
        status: payment.status,
        processed: false,
      };
    }

    const now = this.clock.now();
    const reason = verification.reason ?? null;
    const alreadyAtTarget = payment.status === targetStatus;
    if (!alreadyAtTarget) {
      payment.applyProviderStatus(targetStatus, reason ?? undefined, now);
    }

    const callbackId = existing?.id ?? this.idGenerator.generate();
    const hashedPayload = await this.crypto.hash(command.body);

    await this.unitOfWork.runInTransaction(async (ctx) => {
      if (existing === null) {
        await this.providerCallbackRepository.save({
          id: callbackId,
          providerCode: command.providerCode,
          providerEventId: eventId,
          paymentId: payment.id,
          payloadHash: hashedPayload,
          signatureValid: true,
          processedAt: now,
          createdAt: now,
        });
      } else {
        await this.providerCallbackRepository.markProcessed(callbackId, now, payment.id);
      }

      if (!alreadyAtTarget) {
        await this.paymentRepository.save(payment);
        ctx.addOutboxEvent(
          createDomainEvent({
            eventId: this.idGenerator.generate(),
            aggregateId: payment.id,
            aggregateType: 'Payment',
            eventType: EventTypes.PROVIDER_CALLBACK_RECEIVED,
            version: payment.version,
            timestamp: now,
            correlationId: command.correlationId,
            payload: {
              providerPaymentId: verification.providerPaymentId,
              providerEventId: eventId,
              normalizedStatus,
              targetStatus,
              reason,
            },
          }),
        );
        ctx.addOutboxEvent(
          createDomainEvent({
            eventId: this.idGenerator.generate(),
            aggregateId: payment.id,
            aggregateType: 'Payment',
            eventType: EventTypes.PAYMENT_STATUS_CHANGED,
            version: payment.version,
            timestamp: now,
            correlationId: command.correlationId,
            payload: { status: payment.status, reason },
          }),
        );
      }
    });

    return {
      paymentId: payment.id,
      status: payment.status,
      processed: !alreadyAtTarget,
    };
  }
}
