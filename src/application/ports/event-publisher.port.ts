import { type DomainEvent } from '../../domain/events';

/** Publishes committed domain events to external brokers (post-commit). */
export interface EventPublisherPort {
  publish(event: DomainEvent): Promise<void>;
}
