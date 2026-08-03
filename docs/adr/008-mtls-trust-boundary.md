# ADR 008: mTLS Trust Boundary

## Status

Accepted

## Context

Production guard asserts `MTLS_REQUIRED` for deployments, but Nest does not terminate TLS client certificates in-process.

## Decision

When `MTLS_REQUIRED=true`, `MutualTlsGuard` requires edge-forwarded client-certificate proof (`x-client-cert-verified: SUCCESS` or non-empty `x-forwarded-client-cert`) from trusted infrastructure. Local development keeps `MTLS_REQUIRED=false`.

## Consequences

- The platform does **not** claim end-to-end in-process mTLS.
- Operators must terminate and verify client certificates at the load balancer/ingress and forward only verified identity headers from trusted networks.
