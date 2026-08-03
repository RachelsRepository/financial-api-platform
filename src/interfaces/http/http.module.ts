import { MiddlewareConsumer, Module, NestModule, ValidationPipe } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { TerminusModule } from '@nestjs/terminus';
import { InfrastructureModule } from '../../infrastructure/infrastructure.module';
import { AccountsController } from './controllers/accounts.controller';
import { ConsentsController } from './controllers/consents.controller';
import { HealthController } from './controllers/health.controller';
import { InstitutionsController } from './controllers/institutions.controller';
import { MetricsController } from './controllers/metrics.controller';
import { OAuthController } from './controllers/oauth.controller';
import { OidcController } from './controllers/oidc.controller';
import { PaymentsController } from './controllers/payments.controller';
import { WebhooksController } from './controllers/webhooks.controller';
import { DomainExceptionFilter } from './filters/domain-exception.filter';
import { BearerAuthGuard } from './guards/bearer-auth.guard';
import { MutualTlsGuard } from './guards/mutual-tls.guard';
import { RateLimitGuard } from './guards/rate-limit.guard';
import { ScopesGuard } from './guards/scopes.guard';
import { TrustedHostGuard } from './guards/trusted-host.guard';
import { CorrelationIdMiddleware } from './middleware/correlation-id.middleware';

@Module({
  imports: [InfrastructureModule, TerminusModule],
  controllers: [
    HealthController,
    MetricsController,
    InstitutionsController,
    AccountsController,
    PaymentsController,
    ConsentsController,
    OAuthController,
    OidcController,
    WebhooksController,
  ],
  providers: [
    BearerAuthGuard,
    ScopesGuard,
    RateLimitGuard,
    TrustedHostGuard,
    MutualTlsGuard,
    {
      provide: APP_GUARD,
      useClass: TrustedHostGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RateLimitGuard,
    },
    {
      provide: APP_GUARD,
      useClass: MutualTlsGuard,
    },
    {
      provide: APP_PIPE,
      useFactory: () =>
        new ValidationPipe({
          whitelist: true,
          forbidNonWhitelisted: true,
          transform: true,
          transformOptions: { enableImplicitConversion: true },
        }),
    },
    {
      provide: APP_FILTER,
      useClass: DomainExceptionFilter,
    },
  ],
})
export class HttpModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}
