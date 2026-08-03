import { Injectable, Logger } from '@nestjs/common';
import { OutboxStatus } from '@prisma/client';
import type { DomainEvent } from '@domain/events';
import { KafkaPublisher } from './kafka.publisher';
import { PrismaService } from '../../persistence/prisma/prisma.service';

interface ClaimedOutboxRow {
  id: string;
  aggregate_id: string;
  aggregate_type: string;
  event_type: string;
  version: number;
  payload: Record<string, unknown>;
  correlation_id: string | null;
  causation_id: string | null;
  producer: string;
  created_at: Date;
}

@Injectable()
export class OutboxPublisherService {
  private readonly logger = new Logger(OutboxPublisherService.name);
  private readonly batchSize = 50;
  private readonly workerId = `outbox-worker-${process.pid}`;
  private readonly maxAttempts = 10;

  constructor(
    private readonly prisma: PrismaService,
    private readonly kafkaPublisher: KafkaPublisher,
  ) {}

  async publishPendingBatch(): Promise<number> {
    const claimed = await this.claimPendingEvents();
    if (claimed.length === 0) {
      return 0;
    }

    let publishedCount = 0;

    for (const row of claimed) {
      const event = this.toDomainEvent(row);

      try {
        await this.kafkaPublisher.publish(event);
        await this.prisma.outboxEvent.update({
          where: { id: row.id },
          data: {
            status: OutboxStatus.PUBLISHED,
            publishedAt: new Date(),
            lockedAt: null,
            lockedBy: null,
            lastError: null,
          },
        });
        publishedCount += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown publish error';
        await this.markFailed(row.id, message);
        this.logger.warn(`Failed to publish outbox event ${row.id}: ${message}`);
      }
    }

    return publishedCount;
  }

  private async claimPendingEvents(): Promise<ClaimedOutboxRow[]> {
    return this.prisma.$queryRaw<ClaimedOutboxRow[]>`
      UPDATE outbox_events
      SET
        status = ${OutboxStatus.PUBLISHING}::"OutboxStatus",
        locked_at = NOW(),
        locked_by = ${this.workerId},
        attempts = attempts + 1
      WHERE id IN (
        SELECT id
        FROM outbox_events
        WHERE status = ${OutboxStatus.PENDING}::"OutboxStatus"
          AND next_attempt_at <= NOW()
        ORDER BY created_at ASC
        LIMIT ${this.batchSize}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING
        id,
        aggregate_id,
        aggregate_type,
        event_type,
        version,
        payload,
        correlation_id,
        causation_id,
        producer,
        created_at
    `;
  }

  private async markFailed(eventId: string, errorMessage: string): Promise<void> {
    const existing = await this.prisma.outboxEvent.findUnique({
      where: { id: eventId },
      select: { attempts: true },
    });

    const attempts = existing?.attempts ?? 1;
    const status = attempts >= this.maxAttempts ? OutboxStatus.DEAD_LETTER : OutboxStatus.PENDING;
    const nextAttemptAt = new Date(Date.now() + Math.min(attempts, 10) * 30_000);

    await this.prisma.outboxEvent.update({
      where: { id: eventId },
      data: {
        status,
        lastError: errorMessage,
        lockedAt: null,
        lockedBy: null,
        nextAttemptAt,
      },
    });
  }

  private toDomainEvent(row: ClaimedOutboxRow): DomainEvent {
    return {
      eventId: row.id,
      aggregateId: row.aggregate_id,
      aggregateType: row.aggregate_type,
      eventType: row.event_type,
      version: row.version,
      timestamp: row.created_at,
      correlationId: row.correlation_id,
      causationId: row.causation_id,
      producer: row.producer,
      payload: row.payload,
    };
  }
}
