# Security Policy

## Reporting a vulnerability

If you discover a security issue in this reference codebase, please report it responsibly:

1. **Do not** open a public GitHub issue for exploitable vulnerabilities.
2. Email the maintainer with a description, reproduction steps, and impact assessment.
3. Allow reasonable time for triage before public disclosure.

This is an independent portfolio project without a formal bug bounty program.

## Supported versions

Only the latest commit on the default branch receives security fixes in this reference repository.

## Security design principles

- OAuth 2.1-aligned authorization code + PKCE for public clients
- Refresh token rotation with reuse detection
- Consent-bound, scope-limited access tokens
- Secrets stored hashed; JWT private keys externalized in production
- Production guard rejects unsafe configuration (sandbox, swagger, placeholder secrets)
- Structured log redaction for tokens and account data
- Webhook HMAC verification per provider adapter

## Out of scope

This repository does **not** represent a certified FAPI, OAuth, or Open Banking deployment. Production hardening (WAF, mTLS at edge, HSM key storage, SOC monitoring) is the operator's responsibility.

## Safe harbor

Good-faith security research against a local deployment you control is welcome. Do not test against third-party systems or production environments without authorization.
