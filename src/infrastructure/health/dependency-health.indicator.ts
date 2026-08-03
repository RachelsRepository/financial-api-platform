import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HealthCheckError, HealthIndicator, type HealthIndicatorResult } from '@nestjs/terminus';
import { Kafka } from 'kafkajs';
import { CONFIG_KEY, type AppConfig } from '../../config/configuration';
import { PrismaService } from '../persistence/prisma/prisma.service';
import { RedisService } from '../cache/redis/redis.service';

@Injectable()
export class DependencyHealthIndicator extends HealthIndicator {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly configService: ConfigService,
  ) {
    super();
  }

  async isPostgresHealthy(key = 'postgres'): Promise<HealthIndicatorResult> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return this.getStatus(key, true);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'postgres_unreachable';
      throw new HealthCheckError('Postgres check failed', this.getStatus(key, false, { message }));
    }
  }

  async isRedisHealthy(key = 'redis'): Promise<HealthIndicatorResult> {
    try {
      await this.redis.connect();
      await this.redis.getClient().ping();
      return this.getStatus(key, true);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'redis_unreachable';
      throw new HealthCheckError('Redis check failed', this.getStatus(key, false, { message }));
    }
  }

  async isKafkaHealthy(key = 'kafka'): Promise<HealthIndicatorResult> {
    const config = this.configService.getOrThrow<AppConfig>(CONFIG_KEY);
    if (!config.KAFKA_ENABLED) {
      return this.getStatus(key, true, { skipped: true });
    }

    const kafka = new Kafka({
      clientId: `${config.KAFKA_CLIENT_ID}-health`,
      brokers: config.KAFKA_BROKERS.split(',')
        .map((b) => b.trim())
        .filter(Boolean),
      connectionTimeout: 3000,
      requestTimeout: 3000,
    });
    const admin = kafka.admin();
    try {
      await admin.connect();
      await admin.listTopics();
      return this.getStatus(key, true);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'kafka_unreachable';
      throw new HealthCheckError('Kafka check failed', this.getStatus(key, false, { message }));
    } finally {
      await admin.disconnect().catch(() => undefined);
    }
  }
}
