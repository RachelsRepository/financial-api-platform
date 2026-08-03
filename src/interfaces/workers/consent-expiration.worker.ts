import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ExpireConsentsUseCase } from '../../application/use-cases/consents/expire-consents.use-case';
import { CONFIG_KEY, type AppConfig } from '../../config/configuration';
import { consentsExpiredTotal } from '../../observability/metrics';

@Injectable()
export class ConsentExpirationWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ConsentExpirationWorker.name);
  private timer: NodeJS.Timeout | null = null;
  private readonly config: AppConfig;

  constructor(
    private readonly expireConsents: ExpireConsentsUseCase,
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
    }, this.config.CONSENT_EXPIRATION_INTERVAL_MS);
    this.logger.log(
      `Consent expiration worker started (interval=${this.config.CONSENT_EXPIRATION_INTERVAL_MS}ms)`,
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
      const result = await this.expireConsents.execute({ batchSize: 100 });
      if (result.expiredCount > 0) {
        consentsExpiredTotal.inc(result.expiredCount);
      }
    } catch (error) {
      this.logger.error({ err: error }, 'Consent expiration tick failed');
    }
  }
}
