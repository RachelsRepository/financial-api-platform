# ADR 009: Signing-Key Management

## Status

Accepted

## Context

Prisma includes a `SigningKey` model, but runtime currently loads ES256 material from `JWT_PRIVATE_JWK` / `JWT_PUBLIC_JWKS` environment variables. Docker Compose loads generated keys from gitignored `.env.docker`.

## Decision

Environment-managed JWKs are the supported signing design for this release. The `SigningKey` table is reserved for a future rotation service and is not used at runtime. Production must fail closed when keys are missing/invalid (`rejectProductionMisconfiguration` + TokenService initialize).

## Consequences

- No DB-backed key rotation yet.
- Local Compose must run `node scripts/ensure-compose-env.mjs` (or `make docker-env`) before `docker compose up`.
- Private keys must never be committed.
