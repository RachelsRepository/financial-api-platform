import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  HealthCheck,
  HealthCheckService,
  MemoryHealthIndicator,
  DiskHealthIndicator,
} from '@nestjs/terminus';
import { ConfigService } from '@nestjs/config';
import { CONFIG_KEY, type AppConfig } from '../../../config/configuration';
import { DependencyHealthIndicator } from '../../../infrastructure/health/dependency-health.indicator';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  private readonly config: AppConfig;

  constructor(
    private readonly health: HealthCheckService,
    private readonly memory: MemoryHealthIndicator,
    private readonly disk: DiskHealthIndicator,
    private readonly dependencies: DependencyHealthIndicator,
    configService: ConfigService,
  ) {
    this.config = configService.getOrThrow<AppConfig>(CONFIG_KEY);
  }

  @Get('live')
  @ApiOperation({ summary: 'Liveness probe' })
  live(): { status: string } {
    return { status: 'ok' };
  }

  @Get('ready')
  @HealthCheck()
  @ApiOperation({ summary: 'Readiness probe with dependency checks' })
  ready() {
    return this.health.check([
      () => this.memory.checkHeap('memory_heap', 512 * 1024 * 1024),
      () => this.memory.checkRSS('memory_rss', 768 * 1024 * 1024),
      () => this.dependencies.isPostgresHealthy(),
      () => this.dependencies.isRedisHealthy(),
      () => this.dependencies.isKafkaHealthy(),
    ]);
  }

  @Get()
  @HealthCheck()
  @ApiOperation({ summary: 'Detailed health status' })
  detailed() {
    return this.health.check([
      () => this.memory.checkHeap('memory_heap', 512 * 1024 * 1024),
      () => this.memory.checkRSS('memory_rss', 768 * 1024 * 1024),
      () => this.dependencies.isPostgresHealthy(),
      () => this.dependencies.isRedisHealthy(),
      () => this.dependencies.isKafkaHealthy(),
      () =>
        this.disk.checkStorage('disk', {
          path: '/',
          thresholdPercent: 0.95,
        }),
      () => ({
        app: {
          status: 'up' as const,
          name: this.config.APP_NAME,
          environment: this.config.NODE_ENV,
        },
      }),
    ]);
  }
}
