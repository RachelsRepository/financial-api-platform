# ADR 010: Durable Callback Idempotency

## Status

Accepted

## Context

Signed provider callbacks can be delivered more than once. Schema models existed without application usage.

## Decision

Persist `ProviderCallback` rows keyed by `(providerCode, providerEventId)` before/with financial updates inside the unit of work. Duplicates return an idempotent response without reapplying payment transitions or duplicating financial outbox events.

## Consequences

- Replay after restart is safe using database uniqueness.
- Callback processing remains transactional with payment status changes.
