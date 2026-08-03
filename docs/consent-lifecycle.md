# Consent Lifecycle

Consents govern what data and payment actions a third-party client may perform on behalf of a user.

## State machine

```mermaid
stateDiagram-v2
  [*] --> DRAFT
  DRAFT --> AWAITING_AUTHORIZATION: submitForAuthorization
  DRAFT --> REJECTED: reject
  AWAITING_AUTHORIZATION --> AUTHORIZED: authorize
  AWAITING_AUTHORIZATION --> REJECTED: reject
  AWAITING_AUTHORIZATION --> EXPIRED: expire
  AUTHORIZED --> ACTIVE: activate
  AUTHORIZED --> REVOKED: revoke
  AUTHORIZED --> EXPIRED: expire
  ACTIVE --> REVOKED: revoke
  ACTIVE --> EXPIRED: expire
  REVOKED --> [*]
  EXPIRED --> [*]
  REJECTED --> [*]
```

## Status definitions

| Status                   | Meaning                                                |
| ------------------------ | ------------------------------------------------------ |
| `DRAFT`                  | Created, not yet presented to user                     |
| `AWAITING_AUTHORIZATION` | Awaiting end-user approval                             |
| `AUTHORIZED`             | User approved accounts/scopes; auth code may be issued |
| `ACTIVE`                 | Consent in force for API access                        |
| `REVOKED`                | User or system revoked access                          |
| `EXPIRED`                | Past `expiresAt` or timed out                          |
| `REJECTED`               | User declined                                          |

## Lifecycle sequence

```mermaid
sequenceDiagram
  participant Client as TPP
  participant API as Platform
  participant User as PSU

  Client->>API: Create authorization request
  Note over API: DRAFT → AWAITING_AUTHORIZATION

  User->>API: Authorize (select accounts + scopes)
  Note over API: → AUTHORIZED

  Client->>API: Exchange auth code for tokens
  User->>API: Activate consent (if required)
  Note over API: → ACTIVE

  Client->>API: AIS/PIS calls with access token
  API->>API: consent.ensureAccess(scope, accountId)

  User->>API: Revoke consent
  Note over API: → REVOKED
```

## Access rules

`Consent.ensureAccess` validates:

1. Consent not expired
2. Status is `AUTHORIZED` or `ACTIVE`
3. Required scope in `grantedScopes`
4. Optional account ID in `authorizedAccountIds`

## Expiration worker

A background worker periodically finds consents past expiry in non-terminal states and transitions them to `EXPIRED`, emitting domain events via the outbox.

## Related

- [005 Consent-bound authorization ADR](adr/005-consent-bound-authorization.md)
- [API — Consent endpoints](api.md)
