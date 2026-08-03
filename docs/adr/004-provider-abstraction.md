# ADR 004: Provider Abstraction

## Status

Accepted

## Context

Payment initiation integrates with multiple financial providers (sandbox, Northstar, Meridian, Cobalt). Each has different authentication, payload shapes, status vocabularies, and webhook signature schemes.

## Decision

Define a `FinancialProvider` port with:

- `submitPayment(CanonicalProviderPaymentRequest)`
- `getPaymentStatus(providerPaymentId)`
- `verifyWebhook(WebhookVerificationInput)`

Adapters translate between canonical types and provider-specific formats. Normalized status strings map to domain `PaymentStatus` via `PROVIDER_STATUS_MAP`.

`ProviderRegistry` resolves adapter by institution `providerCode`.

## Alternatives considered

| Alternative                        | Why not chosen                                          |
| ---------------------------------- | ------------------------------------------------------- |
| **Single provider hard-coded**     | Does not demonstrate real-world integration patterns    |
| **Direct HTTP calls in use cases** | Violates clean architecture; untestable without network |
| **Full ISO 20022 message layer**   | Scope too large for reference; canonical DTOs suffice   |

## Consequences

**Positive:**

- New providers added without changing use cases
- Webhook verification encapsulated per adapter
- Sandbox enables deterministic local/testing behavior

**Negative:**

- Canonical model may require extension for advanced payment schemes
- Provider-specific edge cases live in adapters (monitor for duplication)
