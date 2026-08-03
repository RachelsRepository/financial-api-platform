# API Reference

Base URL (local): `http://localhost:3000`

OpenAPI specification: [`openapi/openapi.json`](../openapi/openapi.json) (generate with `pnpm openapi:generate`).

## Authentication

Protected resources require a Bearer access token obtained via OAuth 2.1-aligned token endpoint flows. Tokens are JWTs (ES256) carrying `scope`, `client_id`, `consent_id`, and optional institution context.

## OAuth / OIDC endpoints

| Method | Path                                | Description                    |
| ------ | ----------------------------------- | ------------------------------ |
| GET    | `/oauth/authorize`                  | Begin authorization + consent  |
| POST   | `/oauth/token`                      | Exchange code or refresh token |
| POST   | `/oauth/revoke`                     | Revoke access or refresh token |
| POST   | `/oauth/introspect`                 | Token introspection            |
| GET    | `/.well-known/openid-configuration` | OIDC discovery                 |
| GET    | `/jwks`                             | Public signing keys (JWKS)     |
| GET    | `/userinfo`                         | OIDC UserInfo (`openid` scope) |

### `GET /oauth/authorize`

Creates an authorization request and a consent in `AWAITING_AUTHORIZATION`. PKCE is required.

**Required query parameters**

| Parameter        | Description                            |
| ---------------- | -------------------------------------- |
| `client_id`      | Registered OAuth client identifier     |
| `redirect_uri`   | Must match a registered redirect URI   |
| `response_type`  | Must be `code`                         |
| `scope`          | Space-delimited scopes                 |
| `state`          | Opaque CSRF correlation value          |
| `user_id`        | End-user UUID (demo / local bootstrap) |
| `institution_id` | Institution UUID                       |
| `purpose`        | Consent purpose (min length 3)         |

**PKCE (required)**

| Parameter               | Description                        |
| ----------------------- | ---------------------------------- |
| `code_challenge`        | `BASE64URL(SHA256(code_verifier))` |
| `code_challenge_method` | Must be `S256`                     |

**Optional**

| Parameter | Description                                      |
| --------- | ------------------------------------------------ |
| `nonce`   | Bound into the ID token when `openid` is granted |

**Successful behavior**

Returns JSON including `consentId`, `authorizationRequestId`, and echoed `state`. The client then calls `POST /api/v1/consents/{consentId}/authorize` to obtain an authorization code.

**Error responses**

| Condition                          | Typical result             |
| ---------------------------------- | -------------------------- |
| Validation failure                 | `400` Bad Request          |
| Missing `code_challenge`           | `400` / `invalid_request`  |
| Unknown client / redirect mismatch | Domain authorization error |

### `POST /oauth/token`

Supports `grant_type=authorization_code` (with `code`, `redirect_uri`, `code_verifier`, client credentials) and `grant_type=refresh_token`.

### `POST /oauth/revoke`

Body: `token`, `client_id`, optional `token_type_hint` (`access_token` \| `refresh_token`). Does not accept `client_secret` in the JSON body (whitelist validation).

## Consent endpoints

| Method | Path                              | Description                     |
| ------ | --------------------------------- | ------------------------------- |
| POST   | `/api/v1/consents`                | Create consent                  |
| GET    | `/api/v1/consents/{id}`           | Get consent status              |
| POST   | `/api/v1/consents/{id}/authorize` | User authorizes accounts/scopes |
| POST   | `/api/v1/consents/{id}/activate`  | Activate authorized consent     |
| POST   | `/api/v1/consents/{id}/revoke`    | Revoke consent                  |

## Institutions

| Method | Path                   | Description       |
| ------ | ---------------------- | ----------------- |
| GET    | `/api/v1/institutions` | List institutions |

## Account Information (AIS)

| Method | Path                                  | Required scope       |
| ------ | ------------------------------------- | -------------------- |
| GET    | `/api/v1/accounts`                    | `accounts:read`      |
| GET    | `/api/v1/accounts/{id}`               | `accounts:read`      |
| GET    | `/api/v1/accounts/{id}/balances`      | `balances:read`      |
| GET    | `/api/v1/accounts/{id}/transactions`  | `transactions:read`  |
| GET    | `/api/v1/accounts/{id}/beneficiaries` | `beneficiaries:read` |

AIS reads are served from the platform PostgreSQL account store (consent-filtered). They do not synchronously call a provider adapter on the request path.

## Payment Initiation (PIS)

| Method | Path                              | Required scope          |
| ------ | --------------------------------- | ----------------------- |
| POST   | `/api/v1/payments`                | `payments:write`        |
| GET    | `/api/v1/payments/{id}`           | `payments:read`         |
| POST   | `/api/v1/payments/{id}/authorize` | User authorization step |
| POST   | `/api/v1/payments/{id}/submit`    | Submit to provider      |
| POST   | `/api/v1/payments/{id}/cancel`    | Cancel if cancellable   |

Payment creation accepts an `Idempotency-Key` header for safe retries.

## Webhooks

| Method | Path                          | Description               |
| ------ | ----------------------------- | ------------------------- |
| POST   | `/api/v1/webhooks/{provider}` | Provider status callbacks |

## Health and metrics

| Method | Path            | Description                                       |
| ------ | --------------- | ------------------------------------------------- |
| GET    | `/health/live`  | Liveness                                          |
| GET    | `/health/ready` | Readiness (PostgreSQL, Redis, Kafka + memory)     |
| GET    | `/health`       | Detailed health (includes disk + app metadata)    |
| GET    | `/metrics`      | Prometheus metrics (restrict at the network edge) |

## Error model

Domain errors map to HTTP status codes via `DomainExceptionFilter`:

| Code                       | HTTP | Meaning                            |
| -------------------------- | ---- | ---------------------------------- |
| `invalid_state_transition` | 409  | Illegal consent/payment transition |
| `consent_expired`          | 403  | Consent past expiry                |
| `scope_not_granted`        | 403  | Scope not authorized               |
| `token_reuse_detected`     | 401  | Refresh token reuse                |
| `idempotency_conflict`     | 409  | Concurrent idempotency collision   |

## Correlation

Clients should send `X-Correlation-Id` on all requests for end-to-end tracing.
