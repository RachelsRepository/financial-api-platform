# Payment Lifecycle

Payments represent payment initiation requests bound to an active consent.

## State machine

```mermaid
stateDiagram-v2
  [*] --> CREATED
  CREATED --> AWAITING_AUTHORIZATION: requestAuthorization
  CREATED --> CANCELLED: cancel
  AWAITING_AUTHORIZATION --> AUTHORIZED: authorize
  AWAITING_AUTHORIZATION --> REJECTED: reject
  AWAITING_AUTHORIZATION --> CANCELLED: cancel
  AUTHORIZED --> SUBMITTED: submit
  AUTHORIZED --> CANCELLED: cancel
  AUTHORIZED --> FAILED: fail
  SUBMITTED --> ACCEPTED: accept
  SUBMITTED --> REJECTED: reject
  SUBMITTED --> FAILED: fail
  SUBMITTED --> SETTLED: settle
  ACCEPTED --> SETTLED: settle
  ACCEPTED --> FAILED: fail
  ACCEPTED --> REJECTED: reject
  REJECTED --> [*]
  SETTLED --> [*]
  FAILED --> [*]
  CANCELLED --> [*]
```

## Initiation flow

```mermaid
sequenceDiagram
  participant Client as TPP
  participant API as Platform
  participant User as PSU
  participant Provider as Provider Adapter

  Client->>API: POST /payments (Idempotency-Key)
  Note over API: CREATED → AWAITING_AUTHORIZATION

  User->>API: POST /payments/{id}/authorize
  Note over API: → AUTHORIZED

  Client->>API: POST /payments/{id}/submit
  API->>Provider: submitPayment
  Note over API: → SUBMITTED

  Provider-->>API: webhook status update
  Note over API: → ACCEPTED / SETTLED / FAILED
  API-->>Client: poll GET /payments/{id}
```

## Provider callback

```mermaid
sequenceDiagram
  participant Provider as External Provider
  participant API as Webhook Controller
  participant UC as ProcessProviderCallback
  participant DB as PostgreSQL

  Provider->>API: POST /webhooks/{provider} + signature
  API->>API: verifyWebhook (HMAC)
  API->>UC: normalize status
  UC->>DB: update payment + outbox event
  API-->>Provider: 200 OK
```

## Idempotency

Duplicate `POST /payments` with the same `Idempotency-Key` returns the original payment without creating a new aggregate.

## Reconciliation

Stale `SUBMITTED` payments are polled via the reconciliation worker. See [operations/reconciliation.md](operations/reconciliation.md).

## Provider status mapping

| Provider normalized | Platform status |
| ------------------- | --------------- |
| `pending`           | `SUBMITTED`     |
| `accepted`          | `ACCEPTED`      |
| `settled`           | `SETTLED`       |
| `rejected`          | `REJECTED`      |
| `failed`            | `FAILED`        |

## Related

- [004 Provider abstraction ADR](adr/004-provider-abstraction.md)
- [Provider integrations](provider-integrations.md)
