# ADR 002: Transactional Outbox

## Status

Accepted

## Context

Domain events (consent authorized, payment created, token reuse detected) must be published to Kafka reliably. Publishing directly from use cases after DB commit creates dual-write problems — DB succeeds but message bus fails, or vice versa.

## Decision

Use the **transactional outbox** pattern:

1. Use cases add events to outbox within the same Prisma transaction as aggregate persistence
2. `OutboxWorker` polls unpublished rows
3. `OutboxPublisherService` publishes to Kafka with retry
4. Failures after max retries route to DLQ topic

## Alternatives considered

| Alternative                        | Why not chosen                                                 |
| ---------------------------------- | -------------------------------------------------------------- |
| **Change Data Capture (Debezium)** | Additional operational infrastructure beyond reference scope   |
| **Post-commit fire-and-forget**    | Message loss on broker outage                                  |
| **Two-phase commit (XA)**          | Poor support across PostgreSQL + Kafka; operational complexity |

## Consequences

**Positive:**

- At-least-once delivery with DB consistency
- Events survive API process crashes before publish
- Audit trail in outbox table

**Negative:**

- Eventual consistency for downstream consumers
- Consumers must be idempotent
- Outbox table requires monitoring and retention policy
