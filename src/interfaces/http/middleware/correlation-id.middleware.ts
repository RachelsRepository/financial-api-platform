import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { CORRELATION_ID_HEADER, CORRELATION_ID_REQUEST_KEY } from '../constants';

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: FastifyRequest['raw'], res: FastifyReply['raw'], next: () => void): void {
    const incoming = req.headers[CORRELATION_ID_HEADER];
    const correlationId =
      typeof incoming === 'string' && incoming.trim().length > 0 ? incoming.trim() : randomUUID();

    const fastifyRequest = req as FastifyRequest['raw'] & Record<string, string>;
    fastifyRequest[CORRELATION_ID_REQUEST_KEY] = correlationId;
    res.setHeader(CORRELATION_ID_HEADER, correlationId);
    next();
  }
}

export function getCorrelationId(request: FastifyRequest): string {
  const value = (request.raw as FastifyRequest['raw'] & Record<string, string | undefined>)[
    CORRELATION_ID_REQUEST_KEY
  ];
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }
  const header = request.headers[CORRELATION_ID_HEADER];
  if (typeof header === 'string' && header.length > 0) {
    return header;
  }
  return randomUUID();
}
