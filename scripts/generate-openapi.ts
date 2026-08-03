import 'reflect-metadata';
import { generateKeyPair, exportJWK } from 'jose';
import { type Type } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { CORRELATION_ID_HEADER, IDEMPOTENCY_KEY_HEADER } from '../src/interfaces/http/constants';

const requireFromProject = createRequire(join(process.cwd(), 'package.json'));
const distAppModulePath = join(process.cwd(), 'dist', 'app.module.js');

function loadAppModule(): Type<unknown> {
  if (!existsSync(distAppModulePath)) {
    throw new Error(
      `Missing ${distAppModulePath}. Run \`pnpm build\` before OpenAPI generation so Nest DI has emitDecoratorMetadata.`,
    );
  }
  // Compiled Nest graph (decorator metadata) — do not load src/ via tsx.
  const loaded = requireFromProject(distAppModulePath) as { AppModule: Type<unknown> };
  return loaded.AppModule;
}

async function ensureMinimalEnv(): Promise<void> {
  process.env.NODE_ENV ??= 'test';
  process.env.DATABASE_URL ??=
    'postgresql://fap:fap_dev_secret@localhost:5432/financial_api?schema=public';
  process.env.REDIS_URL ??= 'redis://localhost:6379';
  process.env.KAFKA_BROKERS ??= '';
  process.env.KAFKA_ENABLED ??= 'false';
  process.env.TOKEN_ISSUER ??= 'https://localhost:3000';
  process.env.TOKEN_AUDIENCE ??= 'financial-api';
  process.env.JWT_ACTIVE_KID ??= 'openapi-key-1';
  process.env.ENABLE_SWAGGER ??= 'false';
  process.env.ENABLE_PROVIDER_SANDBOX ??= 'true';
  process.env.OTEL_ENABLED ??= 'false';
  process.env.METRICS_ENABLED ??= 'false';
  process.env.ENABLE_WORKERS ??= 'false';

  if (!process.env.JWT_PRIVATE_JWK || process.env.JWT_PRIVATE_JWK.includes('PLACEHOLDER')) {
    const { privateKey } = await generateKeyPair('ES256');
    const privateJwk = await exportJWK(privateKey);
    privateJwk.kid = process.env.JWT_ACTIVE_KID;
    privateJwk.alg = 'ES256';
    privateJwk.use = 'sig';
    process.env.JWT_PRIVATE_JWK = JSON.stringify(privateJwk);
  }

  process.env.JWT_PUBLIC_JWKS ??= '{"keys":[]}';
}

async function main(): Promise<void> {
  await ensureMinimalEnv();
  const AppModule = loadAppModule();

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ trustProxy: true }),
    { logger: ['error', 'warn'] },
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Financial API Platform')
    .setDescription(
      'Secure financial APIs with OAuth 2.1-aligned authorization patterns, OpenID Connect, and consent management',
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
  const outputDir = join(process.cwd(), 'openapi');
  const outputPath = join(outputDir, 'openapi.json');

  mkdirSync(outputDir, { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(document, null, 2)}\n`, 'utf8');

  await app.close();
  console.log(`OpenAPI document written to ${outputPath}`);
}

void main().catch((error: unknown) => {
  console.error('Failed to generate OpenAPI document:', error);
  process.exitCode = 1;
});
