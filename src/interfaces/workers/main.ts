import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Logger as PinoLogger } from 'nestjs-pino';
import { ConfigService } from '@nestjs/config';
import { CONFIG_KEY, type AppConfig } from '../../config/configuration';
import { initializeTracing, shutdownTracing } from '../../observability/tracing';
import { WorkersModule } from './workers.module';

async function bootstrapWorkers(): Promise<void> {
  const app = await NestFactory.createApplicationContext(WorkersModule.register(), {
    bufferLogs: true,
  });

  app.useLogger(app.get(PinoLogger));
  const logger = new Logger('WorkerBootstrap');
  const configService = app.get(ConfigService);
  const config = configService.getOrThrow<AppConfig>(CONFIG_KEY);

  if (!config.ENABLE_WORKERS) {
    logger.warn('ENABLE_WORKERS is false — exiting worker process');
    await app.close();
    return;
  }

  initializeTracing(config);
  logger.log('Background workers started');

  const shutdown = async (signal: string) => {
    logger.log(`Received ${signal}, shutting down workers`);
    await shutdownTracing();
    await app.close();
    process.exit(0);
  };

  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });
}

void bootstrapWorkers();
