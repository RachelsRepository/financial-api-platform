import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { writeFile } from 'node:fs/promises';
import { CONFIG_KEY, type AppConfig } from '../../config/configuration';
import { RedisService } from '../../infrastructure/cache/redis/redis.service';
import { KafkaPublisher } from '../../infrastructure/messaging/kafka/kafka.publisher';
import { PrismaService } from '../../infrastructure/persistence/prisma/prisma.service';

const DEFAULT_HEARTBEAT_PATH = '/tmp/fap-worker-heartbeat';
const DEFAULT_INTERVAL_MS = 10_000;
const REDIS_HEARTBEAT_KEY = 'worker:heartbeat';
const REDIS_HEARTBEAT_TTL_SECONDS = 60;

/**
 * Publishes a fresh worker heartbeat after probing PostgreSQL, Redis, and Kafka.
 * Docker Compose healthchecks the heartbeat file freshness (not an HTTP endpoint).
 */
@Injectable()
export class WorkerHeartbeatService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WorkerHeartbeatService.name);
  private readonly config: AppConfig;
  private readonly heartbeatPath: string;
  private readonly intervalMs: number;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly kafkaPublisher: KafkaPublisher,
    configService: ConfigService,
  ) {
    this.config = configService.getOrThrow<AppConfig>(CONFIG_KEY);
    this.heartbeatPath = process.env.WORKER_HEARTBEAT_PATH ?? DEFAULT_HEARTBEAT_PATH;
    const parsed = Number.parseInt(process.env.WORKER_HEARTBEAT_INTERVAL_MS ?? '', 10);
    this.intervalMs = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_INTERVAL_MS;
  }

  async onModuleInit(): Promise<void> {
    if (!this.config.ENABLE_WORKERS) {
      return;
    }

    await this.pulse();
    this.timer = setInterval(() => {
      void this.safePulse();
    }, this.intervalMs);
    this.logger.log(
      `Worker heartbeat started (path=${this.heartbeatPath}, interval=${this.intervalMs}ms)`,
    );
  }

  onModuleDestroy(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async safePulse(): Promise<void> {
    try {
      await this.pulse();
    } catch (error) {
      this.logger.error({ err: error }, 'Worker heartbeat pulse failed');
    }
  }

  private async pulse(): Promise<void> {
    await this.prisma.$queryRaw`SELECT 1`;

    await this.redis.connect();
    await this.redis.getClient().ping();

    if (this.config.KAFKA_ENABLED && !this.kafkaPublisher.isEnabled()) {
      throw new Error('Kafka producer is not connected');
    }

    const now = Date.now();
    await this.redis
      .getClient()
      .set(REDIS_HEARTBEAT_KEY, String(now), 'EX', REDIS_HEARTBEAT_TTL_SECONDS);

    await writeFile(
      this.heartbeatPath,
      JSON.stringify({
        ts: now,
        pid: process.pid,
        postgres: 'up',
        redis: 'up',
        kafka: this.config.KAFKA_ENABLED ? 'up' : 'disabled',
      }),
      'utf8',
    );
  }
}
