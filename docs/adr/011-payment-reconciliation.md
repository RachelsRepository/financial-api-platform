# ADR 011: Payment Reconciliation Semantics

## Status

Accepted

## Context

`reconcilePending` was stubbed and provider status lookups did not persist transitions.

## Decision

Reconciliation loads bounded batches of `SUBMITTED` payments, queries the provider adapter, maps through `PROVIDER_STATUS_MAP`, applies only valid transitions, and emits outbox `PAYMENT_STATUS_CHANGED` events. Terminal/invalid/unknown statuses are skipped; provider failures increment metrics and leave the payment eligible for later retries.

## Consequences

- Reconciliation is idempotent for already-applied statuses.
- Workers share the same service path as on-demand reconcile.
