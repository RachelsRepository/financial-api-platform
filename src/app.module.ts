import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { InfrastructureModule } from './infrastructure/infrastructure.module';
import { HttpModule } from './interfaces/http/http.module';
import { WorkersModule } from './interfaces/workers/workers.module';
import { ObservabilityModule } from './observability/observability.module';

@Module({
  imports: [
    ConfigModule,
    ObservabilityModule,
    InfrastructureModule,
    HttpModule,
    WorkersModule.register(),
  ],
})
export class AppModule {}
