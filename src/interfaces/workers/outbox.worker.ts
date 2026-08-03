import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OutboxStatus } from '@prisma/client';
import { TOKENS } from '../../application/ports/tokens';
import { CONFIG_KEY, type AppConfig } from '../../config/configuration';
import { OutboxPublisherService } from '../../infrastructure/messaging/kafka/outbox.publisher.service';
import { PrismaService } from '../../infrastructure/persistence/prisma/prisma.service';
import { dlqDepth, outboxPending, outboxPublishedTotal } from '../../observability/metrics';

@Injectable()
export class OutboxWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxWorker.name);
  private timer: NodeJS.Timeout | null = null;
  private readonly config: AppConfig;

  constructor(
    @Inject(TOKENS.OUTBOX_PUBLISHER) private readonly publisher: OutboxPublisherService,
    private readonly prisma: PrismaService,
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
    }, this.config.OUTBOX_POLL_INTERVAL_MS);
    this.logger.log(`Outbox worker started (interval=${this.config.OUTBOX_POLL_INTERVAL_MS}ms)`);
  }

  onModuleDestroy(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async tick(): Promise<void> {
    try {
      const published = await this.publisher.publishPendingBatch();
      if (published > 0) {
        outboxPublishedTotal.inc(published);
      }

      const [pending, dlq] = await Promise.all([
        this.prisma.outboxEvent.count({ where: { status: OutboxStatus.PENDING } }),
        this.prisma.outboxEvent.count({ where: { status: OutboxStatus.DEAD_LETTER } }),
      ]);
      outboxPending.set(pending);
      dlqDepth.set(dlq);
    } catch (error) {
      this.logger.error({ err: error }, 'Outbox publish tick failed');
    }
  }
}
