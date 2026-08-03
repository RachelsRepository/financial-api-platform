# ADR 007: PKCE Authorization Request Persistence

## Status

Accepted

## Context

PKCE was validated at authorization-request time but not persisted onto the authorization code, allowing token exchange to skip verifier checks.

## Decision

Persist an `AuthorizationRequest` row (redirect URI, S256 challenge/method, state, optional nonce, consent binding, expiry). Consent authorization copies those values onto `AuthorizationCode` and marks the request consumed. Token exchange enforces PKCE, redirect URI match, client binding, expiry, and single use.

## Consequences

- Authorization codes are never issued with empty redirect URI or null challenge when PKCE is required.
- OIDC nonce propagates into ID tokens when present.
