> **Disclaimer:** This is an independent portfolio reference implementation. It is not affiliated with, derived from, or intended to represent any employer, client, financial institution, or regulator. It demonstrates publicly documented standards and common financial API architecture patterns.

# Financial API Platform

Reference implementation for secure financial APIs: OAuth 2.1-aligned authorization, OpenID Connect, consent-bound access, payment initiation, provider integrations, and FAPI-inspired security patterns. This project is **not certified** against OAuth, FAPI, Open Banking, or PSD2 conformance programs.

## Architecture at a Glance

```mermaid
flowchart TD
  Client[Client Application]
  OAuth[OAuth 2.1 + PKCE]
  API[NestJS + Fastify API]
  App[Application Layer]
  Domain[Domain Layer]
  DB[(PostgreSQL)]
  Redis[(Redis)]
  Kafka[(Kafka)]
  Providers[Provider Adapters]
  Worker[Background Workers]

  Client --> OAuth
  OAuth --> API
  API --> App
  App --> Domain

  App --> DB
  App --> Redis
  App --> Kafka
  App --> Providers

  Kafka --> Worker
  Worker --> Providers
  Worker --> DB
```

Request path: client → OAuth/PKCE → API → application use cases → domain rules, with persistence, cache, messaging, and providers behind application ports. Workers consume published events for outbox relay, reconciliation, and related background jobs. See [Architecture overview](#architecture-overview) and [docs/architecture.md](docs/architecture.md) for layer boundaries.

## Features

- **Clean architecture** — domain-driven design with explicit ports and adapters
- **OAuth 2.1-aligned flows** — `GET /oauth/authorize` with PKCE, JWT access tokens, refresh rotation + reuse detection
- **Consent management** — explicit user authorization with scope and account binding (`/api/v1/consents`)
- **Payment initiation** — idempotent payment creation, provider abstraction, webhook verification
- **Transactional outbox** — reliable domain event publishing to Kafka
- **Observability** — structured logging, Prometheus `GET /metrics`, OpenTelemetry tracing
- **Security controls** — startup configuration validation, log redaction, rate limiting, signed webhook verification, trusted-host enforcement, and optional edge-header mTLS enforcement

## Stack

| Layer         | Technology             |
| ------------- | ---------------------- |
| Runtime       | Node.js 22, TypeScript |
| API           | NestJS + Fastify       |
| Persistence   | PostgreSQL + Prisma    |
| Cache         | Redis                  |
| Messaging     | Kafka (Kafkajs)        |
| Testing       | Vitest                 |
| Containers    | Docker, docker-compose |
| IaC reference | Terraform (AWS)        |

## Quick start

### Prerequisites

- Node.js 22+
- pnpm 9.15.4 (via Corepack) — **pnpm only** (`npm ci` is blocked by `preinstall`)
- Docker Desktop or compatible engine (for Compose)

### Quick start with Docker

```bash
corepack enable
corepack prepare pnpm@9.15.4 --activate
pnpm install --frozen-lockfile
make docker-env
make docker-up
make docker-smoke
```

`make docker-env` writes gitignored `.env.docker` with development ES256 JWKs via `scripts/ensure-compose-env.mjs` (keys are not hardcoded). `make docker-up` starts PostgreSQL, Redis, Kafka, migrate/seed, API, and worker. `make docker-smoke` runs the representative HTTP flow against `http://127.0.0.1:3000`. Public signing keys are exposed at `GET /jwks` (not `/.well-known/jwks.json`).

### Local development

For a Nest process on the host (still typically backed by Compose dependencies):

```bash
corepack enable
corepack prepare pnpm@9.15.4 --activate
pnpm install --frozen-lockfile
cp .env.example .env
node scripts/generate-dev-keys.mjs    # print JWT_* lines; merge into .env
make docker-env
make docker-up                        # dependencies + reference API/worker stack
make dev                              # local Nest API (requires local .env)
```

Production deployments must supply real signing keys and fail closed when they are missing.

### Health

| Probe                 | Meaning                                                        |
| --------------------- | -------------------------------------------------------------- |
| `GET /health/live`    | API process liveness                                           |
| `GET /health/ready`   | PostgreSQL, Redis, and Kafka readiness                         |
| Worker Compose health | Heartbeat file after dependency probes (no worker HTTP server) |

### Common commands

```bash
make test              # unit tests
make test-coverage     # tests with coverage thresholds
make typecheck         # TypeScript
make lint              # ESLint
make migrate           # prisma migrate deploy
make openapi-generate  # regenerate openapi/openapi.json
make attribution       # scan for AI tool attribution strings
make docker-down       # stop Compose services
```

## Architecture overview

```mermaid
flowchart TB
  subgraph Clients
    TPP[Third-Party App]
    PSU[End User]
  end

  subgraph Platform
    ALB[Load Balancer]
    API[API Service]
    WRK[Worker Service]
    OUT[Outbox Publisher]
  end

  subgraph Data
    PG[(PostgreSQL)]
    RD[(Redis)]
    KF{{Kafka}}
  end

  subgraph Providers
    NS[Northstar]
    MR[Meridian]
    SB[Sandbox]
  end

  TPP --> ALB --> API
  PSU --> API
  API --> PG
  API --> RD
  API --> OUT
  WRK --> PG
  WRK --> KF
  OUT --> KF
  API --> NS
  API --> MR
  API --> SB
  NS --> API
  MR --> API
```

See [docs/architecture.md](docs/architecture.md) for layer boundaries and event flows. AIS account reads are repository-backed (PostgreSQL), not synchronous provider fetches.

## Documentation

| Document                                               | Description                                                 |
| ------------------------------------------------------ | ----------------------------------------------------------- |
| [Case study](docs/case-study.md)                       | End-to-end implementation narrative                         |
| [Architecture](docs/architecture.md)                   | System design and layer boundaries                          |
| [API](docs/api.md)                                     | REST surface (`/oauth/*`, `/api/v1/*`, `/jwks`, `/metrics`) |
| [Security](docs/security.md)                           | Controls and token handling                                 |
| [Consent lifecycle](docs/consent-lifecycle.md)         | Consent state machine                                       |
| [Payment lifecycle](docs/payment-lifecycle.md)         | Payment state machine                                       |
| [Provider integrations](docs/provider-integrations.md) | Adapter patterns                                            |
| [Deployment](docs/deployment.md)                       | Docker, worker health, AWS reference                        |
| [Threat model](docs/threat-model.md)                   | STRIDE-oriented analysis                                    |
| [Failure scenarios](docs/failure-scenarios.md)         | Degradation and recovery                                    |
| [Runbook](docs/operations/runbook.md)                  | Operational procedures                                      |
| [Reconciliation](docs/operations/reconciliation.md)    | Payment reconciliation                                      |
| [ADRs](docs/adr/)                                      | Architecture decision records                               |

## Project structure

```
src/
  domain/           # Entities, value objects, policies (framework-free)
  application/      # Use cases and ports
  infrastructure/   # Prisma, Redis, Kafka, providers
  interfaces/       # HTTP controllers, workers
  observability/    # Metrics, tracing, logging
test/               # Vitest unit and architecture tests
terraform/          # AWS reference modules
scripts/            # OpenAPI, keys, worker healthcheck, attribution scan
```

## Testing

Tests live under `test/` (unit, architecture, and representative e2e use-case flow). Package management is **pnpm only** (`pnpm install --frozen-lockfile`).

```bash
pnpm test                 # unit + architecture
pnpm test:integration     # Postgres testcontainers (Docker required)
pnpm test:e2e             # representative use-case e2e flow
pnpm test:coverage        # domain coverage thresholds in vitest.config.ts
```

### Docker runtime smoke

Prefer the Quick start with Docker path (`make docker-smoke`). Equivalent:

```bash
make docker-env
make docker-up
node scripts/docker-smoke.mjs
```

This exercises JWT token exchange (+ ID token when `openid` is granted), PKCE, accounts/payments, sandbox webhook settlement, refresh-token reuse detection, consent revocation, and verifies outbox/audit/`provider_callbacks` rows. Readiness requires PostgreSQL, Redis, and Kafka. API and worker Compose healthchecks must both report healthy.

## Limitations (honest)

- Not OAuth/FAPI certified; sandbox/fictional providers only
- mTLS is edge-header enforcement, not in-process TLS termination
- Signing keys are environment-managed; DB `SigningKey` rotation is not implemented
- Global coverage is not an 85% gate; HTTP contract matrix is incomplete
- Not a turnkey production deployment

## CI

GitHub Actions (`.github/workflows/ci.yml`) runs lockfile verification, Prisma generate/validate, typecheck, lint, format check, dependency-cruiser, tests with coverage, OpenAPI check, Docker build, Terraform fmt/validate, and attribution scan.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md), and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## License

MIT — see [LICENSE](LICENSE).

---

> **Disclaimer:** This is an independent portfolio reference implementation. It is not affiliated with, derived from, or intended to represent any employer, client, financial institution, or regulator. It demonstrates publicly documented standards and common financial API architecture patterns.
