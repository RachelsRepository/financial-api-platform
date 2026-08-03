import { Controller, Get, Header, HttpCode } from '@nestjs/common';
import { ApiOperation, ApiProduces, ApiResponse, ApiTags } from '@nestjs/swagger';
import { getMetricsSnapshot } from '../../../observability/metrics';

@ApiTags('Observability')
@Controller('metrics')
export class MetricsController {
  @Get()
  @HttpCode(200)
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  @ApiOperation({
    summary: 'Prometheus metrics scrape endpoint',
    description:
      'Returns process and application metrics in Prometheus text exposition format. ' +
      'This endpoint is unauthenticated at the application layer; in production it should ' +
      'normally be restricted by infrastructure or network policy (private scrape network, ' +
      'ingress allowlists, or a sidecar).',
  })
  @ApiProduces('text/plain')
  @ApiResponse({
    status: 200,
    description: 'Prometheus metrics snapshot',
    content: {
      'text/plain': {
        schema: {
          type: 'string',
          example:
            '# HELP financial_api_process_cpu_user_seconds_total Total user CPU time spent in seconds.\n',
        },
      },
    },
  })
  async metrics(): Promise<string> {
    return getMetricsSnapshot();
  }
}
