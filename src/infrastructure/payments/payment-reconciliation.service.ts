import { Inject, Injectable, Logger } from '@nestjs/common';
import { TOKENS } from '@application/ports/tokens';
import type { ClockPort } from '@application/ports/clock.port';
import type { IdGeneratorPort } from '@application/ports/id-generator.port';
import type { PaymentRepository } from '@application/ports/payment.repository';
import type { FinancialProviderPort } from '@application/ports/provider.port';
import type { UnitOfWorkPort } from '@application/ports/unit-of-work.port';
import { createDomainEvent, EventTypes } from '@domain/events';
import { PaymentStatus, PROVIDER_STATUS_MAP } from '@domain/policies/state-machines';
import { providerFailuresTotal, providerTimeoutsTotal } from '../../observability/metrics';

export interface PaymentReconciliationResult {
  checked: number;
  updated: number;
}

@Injectable()
export class PaymentReconciliationService {
  private readonly logger = new Logger(PaymentReconciliationService.name);

  constructor(
    @Inject(TOKENS.PAYMENT_REPOSITORY)
    private readonly paymentRepository: PaymentRepository,
    @Inject(TOKENS.FINANCIAL_PROVIDER_PORT)
    private readonly provider: FinancialProviderPort,
    @Inject(TOKENS.UNIT_OF_WORK_PORT)
    private readonly unitOfWork: UnitOfWorkPort,
    @Inject(TOKENS.CLOCK_PORT)
    private readonly clock: ClockPort,
    @Inject(TOKENS.ID_GENERATOR_PORT)
    private readonly idGenerator: IdGeneratorPort,
  ) {}

  async reconcilePending(limit = 25): Promise<PaymentReconciliationResult> {
    const payments = await this.paymentRepository.findSubmitted(limit);
    let updated = 0;
    for (const payment of payments) {
      const didUpdate = await this.reconcilePayment(payment.id);
      if (didUpdate) {
        updated += 1;
      }
    }
    return { checked: payments.length, updated };
  }

  async reconcilePayment(paymentId: string): Promise<boolean> {
    const payment = await this.paymentRepository.findById(paymentId);
    if (payment === null || payment.providerPaymentId === null) {
      return false;
    }
    if (payment.status !== PaymentStatus.SUBMITTED) {
      return false;
    }

    try {
      const status = await this.provider.getPaymentStatus(
        payment.providerCode,
        payment.providerPaymentId,
      );
      const targetStatus = PROVIDER_STATUS_MAP[status.normalizedStatus];
      if (targetStatus === undefined || targetStatus === payment.status) {
        return false;
      }

      const now = this.clock.now();
      payment.applyProviderStatus(targetStatus, status.reason ?? undefined, now);

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
            payload: {
              status: payment.status,
              reason: status.reason,
              source: 'reconciliation',
            },
          }),
        );
      });

      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown';
      if (message.toLowerCase().includes('timeout')) {
        providerTimeoutsTotal.inc({ provider: payment.providerCode, operation: 'reconcile' });
      } else {
        providerFailuresTotal.inc({ provider: payment.providerCode, operation: 'reconcile' });
      }
      this.logger.warn(`Reconciliation failed for payment ${paymentId}: ${message}`);
      return false;
    }
  }
}
