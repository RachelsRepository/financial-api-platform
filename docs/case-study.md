# Case Study — Financial API Platform

> Independent portfolio reference implementation. Not affiliated with any employer, client, financial institution, or regulator. Demo data is fictional. This project is **not** OAuth-, FAPI-, Open Banking-, or PSD2-certified.

## 1. Problem

Third-party financial applications need a secure way to obtain user-authorized access to account information and payment initiation without holding long-lived credentials. That requires OAuth-aligned authorization, explicit consent, scope enforcement, durable provider callbacks, reliable domain events, and operational visibility.

## 2. Why the project was built

To demonstrate a **staff-level backend reference** that combines clean architecture, OAuth 2.1-aligned flows, consent-bound APIs, payment initiation, transactional outbox messaging, reconciliation, and production-shaped Docker operations — with documentation that matches runtime behavior.

## 3. Scope

| In scope                                                                       | Out of scope                                 |
| ------------------------------------------------------------------------------ | -------------------------------------------- |
| Authorization code + PKCE, JWT access tokens, refresh rotation/reuse detection | Formal OAuth/FAPI certification              |
| Consent + AIS/PIS HTTP APIs                                                    | Real bank production connectivity            |
| Sandbox/fictional provider adapters                                            | In-process mTLS termination                  |
| Transactional outbox → Kafka, reconciliation workers                           | Database-backed signing-key rotation service |
| Docker Compose local stack + smoke script                                      | Turnkey multi-region production deployment   |

## 4. Architecture overview

NestJS + Fastify HTTP API and a separate worker process share domain/application/infrastructure layers. PostgreSQL is the system of record; Redis supports rate limiting/cache; Kafka carries published domain events. See [architecture.md](architecture.md).

## 5. Clean Architecture boundaries

- **Domain** — entities, value objects, state machines (framework-free)
- **Application** — use cases + ports
- **Infrastructure** — Prisma, Redis, Kafka, JWT (`TokenService`), provider adapters
- **Interfaces** — HTTP controllers, workers

`dependency-cruiser` enforces inward dependency direction in CI ([ADR 001](adr/001-clean-architecture.md)).

## 6. OAuth 2.1-aligned authorization flow

**Implemented and verified:** `GET /oauth/authorize` creates an authorization request and consent; user authorization yields a code; `POST /oauth/token` exchanges the code.

## 7. PKCE persistence and verification

**Implemented and verified:** `code_challenge` is required and persisted on `AuthorizationRequest` / authorization code; exchange verifies `S256` (`code_verifier`). Missing challenge or wrong verifier fails closed ([ADR 007](adr/007-pkce-authorization-request-persistence.md)).

## 8. JWT access-token model

**Implemented and verified:** Access tokens are ES256 JWTs with `jti`, scopes, consent binding; revocation checks `jti` records ([ADR 006](adr/006-jwt-access-tokens.md)).

## 9. Refresh-token rotation and reuse detection

**Implemented and verified:** Refresh tokens are opaque and hashed; rotation issues a new token; reuse revokes the entire family and emits `token.reuse_detected` ([ADR 003](adr/003-token-storage.md)).

## 10. Consent lifecycle

**Implemented and verified:** Create → await authorization → authorize → activate (or activate via token exchange) → revoke/expire. Controllers under `/api/v1/consents`.

## 11. Account information access

**Implemented and verified:** AIS endpoints under `/api/v1/accounts*` read from `AccountRepository` (PostgreSQL) after Bearer auth, consent, and scope checks. **Not** a synchronous provider-adapter fetch on the GET path.

## 12. Payment initiation lifecycle

**Implemented and verified:** Create (idempotent) → authorize → submit → provider callback / reconciliation → terminal states. Controllers under `/api/v1/payments`.

## 13. Provider abstraction

**Implemented and verified:** `FinancialProviderPort` with sandbox (and named fictional adapters). Submit/status/webhook verification go through adapters ([ADR 004](adr/004-provider-abstraction.md)).

## 14. Callback signature verification and durable replay protection

**Implemented and verified:** Provider-specific webhook verification; durable idempotency via `ProviderCallback` uniqueness ([ADR 010](adr/010-durable-callback-idempotency.md)). The Prisma `WebhookReceipt` model is unused residual schema.

## 15. Transactional outbox

**Implemented and verified:** Domain events written in the same unit of work; outbox worker publishes to Kafka with retry/DLQ handling ([ADR 002](adr/002-transactional-outbox.md)).

## 16. Reconciliation

**Implemented and verified:** `PaymentReconciliationWorker` polls SUBMITTED payments, calls `getPaymentStatus`, applies mapped transitions, emits outbox events ([ADR 011](adr/011-payment-reconciliation.md)).

## 17. Audit logging

**Implemented and verified:** Audit port records consent/identity/payment actions when `ENABLE_AUDIT=true` (`audit_events` table).

## 18. Health and readiness

**Implemented and verified:**

- `GET /health/live` — process liveness
- `GET /health/ready` — PostgreSQL, Redis, Kafka (+ memory)

## 19. Worker behavior

**Implemented and verified:** Separate process runs outbox, consent expiration, and payment reconciliation. Compose health uses a **heartbeat file** refreshed after PostgreSQL/Redis/Kafka probes (`WorkerHeartbeatService` + `scripts/worker-healthcheck.sh`), not an HTTP server.

## 20. Observability and `/metrics`

**Implemented and verified:** Prometheus text metrics at `GET /metrics` (unauthenticated at the app layer; restrict via infrastructure). OpenTelemetry optional via `OTEL_*`.

## 21. Security boundaries

Rate limiting, trusted hosts, production guard (blocks sandbox/swagger/placeholder secrets in production), log redaction, webhook verification. See [security.md](security.md).

## 22. mTLS edge-header model

**Representative design / implemented guard:** `MTLS_REQUIRED` enables edge-header enforcement (`MutualTlsGuard`). **Not implemented:** in-process TLS client-certificate termination ([ADR 008](adr/008-mtls-trust-boundary.md)).

## 23. Environment-managed signing keys

**Implemented and verified:** Keys from `JWT_PRIVATE_JWK` / `JWT_PUBLIC_JWKS` / `JWT_ACTIVE_KID`; public set at `GET /jwks`. Compose uses generated `.env.docker`. **Future improvement:** database-managed key rotation (`SigningKey` table unused) ([ADR 009](adr/009-signing-key-management.md)).

## 24. Testing strategy

| Suite                   | Role                                               |
| ----------------------- | -------------------------------------------------- |
| `pnpm test`             | Unit + architecture boundary tests                 |
| `pnpm test:e2e`         | Representative use-case flow                       |
| `pnpm test:integration` | Postgres testcontainers                            |
| `pnpm test:coverage`    | Domain coverage thresholds (not a global 85% gate) |

There is **no** complete Nest HTTP contract matrix for every AIS/PIS route.

## 25. Docker smoke flow

```bash
make docker-env
make docker-up
node scripts/docker-smoke.mjs
```

Exercises JWT exchange (+ ID token when `openid` granted), PKCE, accounts/payments, sandbox webhook settlement, refresh reuse detection, consent revocation, and related persistence checks.

## 26. Tradeoffs

| Choice             | Tradeoff                                      |
| ------------------ | --------------------------------------------- |
| Monolith + workers | Simpler ops than microservices; shared schema |
| Env-managed JWKs   | Simple and fail-closed; rotation is external  |
| Sandbox providers  | Runnable demos; not production bank fidelity  |
| Edge mTLS headers  | Realistic LB pattern; app trusts the edge     |

## 27. Known limitations

- Not production-certified; fictional sandbox providers
- Worker HTTP healthcheck intentionally disabled; heartbeat depends on shared event loop
- Global test coverage is modest; domain thresholds only
- OpenAPI may omit operational caveats beyond documented routes
- Incomplete Nest TestingModule HTTP matrix

## 28. Future improvements

- Database-backed signing-key rotation service
- Broader HTTP contract / conformance suites
- Stronger worker liveness (per-job heartbeats / lease fencing)
- Real provider adapters behind the same ports

## 29. Disclaimer

This is an independent portfolio reference implementation. It is not affiliated with, derived from, or intended to represent any employer, client, financial institution, or regulator. All institutions, users, accounts, and payment data in seeds and demos are fictional.

### Classification legend

| Label                        | Meaning                                                     |
| ---------------------------- | ----------------------------------------------------------- |
| **Implemented and verified** | Present in code and exercised by tests and/or Docker smoke  |
| **Representative design**    | Pattern shown for discussion; not a full production control |
| **Future improvement**       | Explicitly not claimed as current capability                |
