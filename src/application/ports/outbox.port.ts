import { type DomainEvent } from '../../domain/events';

/** Persists outbox records for at-least-once downstream delivery. */
export interface OutboxPort {
  enqueue(event: DomainEvent): Promise<void>;
}
