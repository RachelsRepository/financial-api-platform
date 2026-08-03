# ADR 006: JWT Access Tokens

## Status

Accepted

## Context

BearerAuthGuard validates signed JWTs via TokenService. Issuing opaque access tokens broke AIS/PIS authentication after code exchange.

## Decision

Access tokens are ES256 JWTs issued and validated exclusively by TokenService (via AccessTokenIssuerPort / AccessTokenValidatorPort). Refresh tokens remain opaque, hashed, and family-rotated. Access-token metadata is persisted by `jti` for revocation/introspection.

## Consequences

- Exchanged and refreshed access tokens authenticate protected endpoints.
- Introspection/revocation operate on JWT `jti` (or opaque refresh hashes).
- Signing material remains environment-managed for this release (see ADR 009).
