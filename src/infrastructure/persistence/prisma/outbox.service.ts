import { Injectable } from '@nestjs/common';
import { OutboxStatus, type Prisma } from '@prisma/client';
import type { DomainEvent } from '@domain/events';
import type { OutboxPort } from '@application/ports/outbox.port';
import { PrismaService } from './prisma.service';

@Injectable()
export class PrismaOutboxService implements OutboxPort {
  constructor(private readonly prisma: PrismaService) {}

  async enqueue(event: DomainEvent): Promise<void> {
    await this.prisma.outboxEvent.create({
      data: {
        id: event.eventId,
        aggregateId: event.aggregateId,
        aggregateType: event.aggregateType,
        eventType: event.eventType,
        version: event.version,
        payload: event.payload as Prisma.InputJsonValue,
        correlationId: event.correlationId,
        causationId: event.causationId,
        producer: event.producer,
        status: OutboxStatus.PENDING,
        nextAttemptAt: event.timestamp,
        createdAt: event.timestamp,
      },
    });
  }
}
