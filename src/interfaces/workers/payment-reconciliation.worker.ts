import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TOKENS } from '../../application/ports/tokens';
import { CONFIG_KEY, type AppConfig } from '../../config/configuration';
import { PaymentReconciliationService } from '../../infrastructure/payments/payment-reconciliation.service';

@Injectable()
export class PaymentReconciliationWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PaymentReconciliationWorker.name);
  private timer: NodeJS.Timeout | null = null;
  private readonly config: AppConfig;

  constructor(
    @Inject(TOKENS.PAYMENT_RECONCILIATION)
    private readonly reconciliation: PaymentReconciliationService,
    configService: ConfigService,
  ) {
    this.config = configService.getOrThrow<AppConfig>(CONFIG_KEY);
  }

  onModuleInit(): void {
    if (!this.config.ENABLE_WORKERS) {
      return;
    }
    this.timer = setInterval(() => {
      void this.tick();
    }, this.config.PAYMENT_RECONCILIATION_INTERVAL_MS);
    this.logger.log(
      `Payment reconciliation worker started (interval=${this.config.PAYMENT_RECONCILIATION_INTERVAL_MS}ms)`,
    );
  }

  onModuleDestroy(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async tick(): Promise<void> {
    try {
      await this.reconciliation.reconcilePending(25);
    } catch (error) {
      this.logger.error({ err: error }, 'Payment reconciliation tick failed');
    }
  }
}
