# ADR 003: Token Storage

## Status

Accepted

## Context

The platform issues JWT access tokens and opaque refresh tokens. Storage strategy affects security (leak impact), rotation, reuse detection, and revocation semantics.

## Decision

- **Access tokens:** JWT (ES256), short TTL, validated via signature + claims; optional introspection endpoint for opaque deployments
- **Refresh tokens:** Opaque random values stored **hashed** (SHA-256) in PostgreSQL
- **Refresh token families:** Each family tracks `currentTokenHash`, `generation`, and revocation/reuse timestamps
- **Authorization codes:** Single-use, hashed, short TTL (10 minutes)
- **Client secrets:** scrypt-hashed with serialized `algorithm:salt:hash` format

On refresh:

1. Validate presented token against family hash
2. Rotate to new hash, increment generation
3. On mismatch or reuse of revoked family → revoke entire family

## Alternatives considered

| Alternative                          | Why not chosen                                          |
| ------------------------------------ | ------------------------------------------------------- |
| **Stateful access tokens only**      | Higher DB load on every AIS/PIS request                 |
| **Refresh tokens as JWTs**           | Harder to revoke and detect reuse without central store |
| **No rotation (long-lived refresh)** | Violates OAuth 2.1-aligned best practice                |

## Consequences

**Positive:**

- Reuse detection limits blast radius of stolen refresh tokens
- JWT access tokens enable stateless validation at resource servers
- Hashing limits credential exposure if DB leaked

**Negative:**

- Refresh flow requires DB read/write per rotation
- JWT revocation requires short TTL + optional denylist for immediate revoke
