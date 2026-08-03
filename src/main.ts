import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from '@fastify/helmet';
import { Logger as PinoLogger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { CONFIG_KEY, type AppConfig } from './config/configuration';
import { CORRELATION_ID_HEADER, IDEMPOTENCY_KEY_HEADER } from './interfaces/http/constants';
import { DomainExceptionFilter } from './interfaces/http/filters/domain-exception.filter';
import { rejectProductionMisconfiguration } from './infrastructure/security/production-guard';
import { initializeTracing, shutdownTracing } from './observability/tracing';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ trustProxy: true }),
    { bufferLogs: true },
  );

  app.useLogger(app.get(PinoLogger));

  const configService = app.get(ConfigService);
  const config = configService.getOrThrow<AppConfig>(CONFIG_KEY);
  const logger = new Logger('Bootstrap');

  rejectProductionMisconfiguration({
    nodeEnv: config.NODE_ENV,
    tokenIssuer: config.TOKEN_ISSUER,
    jwtPrivateJwk: config.JWT_PRIVATE_JWK,
    jwtActiveKid: config.JWT_ACTIVE_KID,
    databaseUrl: config.DATABASE_URL,
    redisUrl: config.REDIS_URL,
    enableProviderSandbox: config.ENABLE_PROVIDER_SANDBOX,
    trustedHosts: config.TRUSTED_HOSTS,
    enableSwagger: config.ENABLE_SWAGGER,
    mtlsRequired: config.MTLS_REQUIRED,
  });

  initializeTracing(config);

  await app.register(helmet, {
    contentSecurityPolicy: config.NODE_ENV === 'production',
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new DomainExceptionFilter());

  if (config.ENABLE_SWAGGER) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Financial API Platform')
      .setDescription(
        'Secure financial APIs with OAuth 2.1, OpenID Connect, and consent management',
      )
      .setVersion('1.0.0')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'OAuth 2.1 access token',
        },
        'bearer',
      )
      .addApiKey(
        {
          type: 'apiKey',
          in: 'header',
          name: IDEMPOTENCY_KEY_HEADER,
          description: 'Idempotency key for safe payment retries',
        },
        'idempotency',
      )
      .addApiKey(
        {
          type: 'apiKey',
          in: 'header',
          name: CORRELATION_ID_HEADER,
          description: 'End-to-end request correlation identifier',
        },
        'correlation',
      )
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, document);
    logger.log('Swagger enabled at /docs');
  }

  app.enableShutdownHooks();

  const trustedHosts = config.TRUSTED_HOSTS.split(',')
    .map((host) => host.trim())
    .filter(Boolean);

  await app.listen(config.APP_PORT, '0.0.0.0');

  logger.log(`Listening on port ${config.APP_PORT} (trusted hosts: ${trustedHosts.join(', ')})`);

  const shutdown = async (signal: string) => {
    logger.log(`Received ${signal}, starting graceful shutdown`);
    await app.close();
    await shutdownTracing();
    process.exit(0);
  };

  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });
}

void bootstrap();
