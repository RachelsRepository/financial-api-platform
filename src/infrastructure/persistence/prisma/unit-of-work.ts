import { Injectable } from '@nestjs/common';
import { OutboxStatus, type Prisma } from '@prisma/client';
import type { DomainEvent } from '@domain/events';
import type { UnitOfWorkContext, UnitOfWorkPort } from '@application/ports/unit-of-work.port';
import { getPrismaClient, runWithTransactionClient } from './prisma-transaction.context';
import { PrismaService } from './prisma.service';

class TransactionContext implements UnitOfWorkContext {
  private readonly events: DomainEvent[] = [];

  addOutboxEvent(event: DomainEvent): void {
    this.events.push(event);
  }

  drainEvents(): DomainEvent[] {
    return [...this.events];
  }
}

@Injectable()
export class PrismaUnitOfWork implements UnitOfWorkPort {
  constructor(private readonly prisma: PrismaService) {}

  async runInTransaction<T>(work: (ctx: UnitOfWorkContext) => Promise<T>): Promise<T> {
    const pendingContext = new TransactionContext();

    return this.prisma.$transaction(async (tx) =>
      runWithTransactionClient(tx, async () => {
        const result = await work(pendingContext);
        const events = pendingContext.drainEvents();

        if (events.length > 0) {
          await getPrismaClient(this.prisma).outboxEvent.createMany({
            data: events.map((event) => ({
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
            })),
          });
        }

        return result;
      }),
    );
  }
}
