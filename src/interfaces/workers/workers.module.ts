import { Module } from '@nestjs/common';
import { ConfigModule } from '../../config/config.module';
import { PrismaModule } from '../../infrastructure/persistence/prisma/prisma.module';
import { InfrastructureModule } from '../../infrastructure/infrastructure.module';
import { ObservabilityModule } from '../../observability/observability.module';
import { ConsentExpirationWorker } from './consent-expiration.worker';
import { OutboxWorker } from './outbox.worker';
import { PaymentReconciliationWorker } from './payment-reconciliation.worker';
import { WorkerHeartbeatService } from './worker-heartbeat.service';

@Module({})
export class WorkersModule {
  static register() {
    return {
      module: WorkersModule,
      imports: [ConfigModule, ObservabilityModule, InfrastructureModule, PrismaModule],
      providers: [
        WorkerHeartbeatService,
        OutboxWorker,
        ConsentExpirationWorker,
        PaymentReconciliationWorker,
      ],
    };
  }
}
