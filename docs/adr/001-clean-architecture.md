# ADR 001: Clean Architecture

## Status

Accepted

## Context

The platform spans OAuth/OIDC identity, consent management, account information, payment initiation, and provider integrations. Business rules (consent states, payment transitions, monetary calculations, scope enforcement) must remain testable and stable as infrastructure choices evolve (database, messaging, HTTP framework).

## Decision

Adopt clean architecture with four layers:

1. **Domain** — entities, value objects, policies; zero framework imports
2. **Application** — use cases orchestrating domain logic via ports
3. **Infrastructure** — Prisma, Redis, Kafka, provider adapters implementing ports
4. **Interfaces** — NestJS controllers and workers

Dependency direction flows inward. `dependency-cruiser` enforces boundaries in CI.

## Alternatives considered

| Alternative                                   | Why not chosen                                                             |
| --------------------------------------------- | -------------------------------------------------------------------------- |
| **Anemic domain + service layer only**        | State transition rules spread across services; harder to exhaustively test |
| **Modular monolith by feature without ports** | Feature modules couple directly to Prisma; refactors become costly         |
| **Microservices upfront**                     | Excessive operational complexity for a reference implementation            |

## Consequences

**Positive:**

- Domain tests run without NestJS/Prisma
- Infrastructure swappable behind ports
- Clear onboarding path via layer documentation

**Negative:**

- More boilerplate (ports, mappers, DTOs)
- Use cases require manual DI wiring in NestJS modules
