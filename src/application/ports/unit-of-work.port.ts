import { type DomainEvent } from '../../domain/events';

export interface UnitOfWorkContext {
  addOutboxEvent(event: DomainEvent): void;
}

export interface UnitOfWorkPort {
  runInTransaction<T>(work: (ctx: UnitOfWorkContext) => Promise<T>): Promise<T>;
}
