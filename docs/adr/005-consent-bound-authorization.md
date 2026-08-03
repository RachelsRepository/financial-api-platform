# ADR 005: Consent-Bound Authorization

## Status

Accepted

## Context

Open Banking and PSD2-style APIs require explicit user consent linking a third-party client to specific accounts and scopes. Access tokens must not grant more privilege than the user authorized.

## Decision

- Every AIS/PIS access token carries `consent_id` (and institution context)
- `AccessPolicy.decideAccountAccess` validates token consent matches resource consent
- `Consent.ensureAccess` enforces status, expiry, granted scopes, and authorized account IDs
- `AuthorizationDecisionService` additionally validates token `client_id` owns the consent's client record

Consent state machine gates when access is permitted (`AUTHORIZED` or `ACTIVE` only).

## Alternatives considered

| Alternative                                   | Why not chosen                                                       |
| --------------------------------------------- | -------------------------------------------------------------------- |
| **Scope-only tokens without consent binding** | Cannot enforce account-level authorization or revocation per consent |
| **Session cookies for TPP**                   | Not suitable for third-party API integration model                   |
| **Per-request user password**                 | Poor UX; not aligned with OAuth delegation                           |

## Consequences

**Positive:**

- Fine-grained revocation (revoke consent → tokens ineffective at resource layer)
- Account isolation within institution
- Aligns with FAPI 2.0-aligned security patterns (non-certification)

**Negative:**

- Every resource request requires consent load (cache opportunities in infrastructure)
- Token claims must stay synchronized with consent state changes
