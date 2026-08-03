import { Controller, Headers, Param, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { ProcessProviderCallbackUseCase } from '../../../application/use-cases/payments/process-provider-callback.use-case';
import { getCorrelationId } from '../middleware/correlation-id.middleware';

@ApiTags('Webhooks')
@Controller('api/v1/webhooks')
export class WebhooksController {
  constructor(private readonly processProviderCallback: ProcessProviderCallbackUseCase) {}

  @Post(':providerCode')
  @ApiOperation({ summary: 'Receive provider payment status callbacks' })
  async handleProviderCallback(
    @Param('providerCode') providerCode: string,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Req() request: FastifyRequest,
  ) {
    const normalizedHeaders: Record<string, string> = {};
    for (const [key, value] of Object.entries(headers)) {
      if (typeof value === 'string') {
        normalizedHeaders[key.toLowerCase()] = value;
      } else if (Array.isArray(value) && value.length > 0) {
        normalizedHeaders[key.toLowerCase()] = value[0] ?? '';
      }
    }

    const body =
      typeof request.body === 'string' ? request.body : JSON.stringify(request.body ?? {});

    return this.processProviderCallback.execute({
      providerCode,
      headers: normalizedHeaders,
      body,
      correlationId: getCorrelationId(request),
    });
  }
}
