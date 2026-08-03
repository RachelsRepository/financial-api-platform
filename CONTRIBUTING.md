# Contributing

Thank you for your interest in this reference implementation.

## Development setup

1. Install Node.js 22 and enable Corepack (`corepack enable`).
2. Run `make install` to install dependencies with pnpm 9.15.4.
3. Copy `.env.example` to `.env` and generate development signing keys with `node scripts/generate-dev-keys.mjs`.
4. Start infrastructure with `make docker-up` or run Postgres/Redis/Kafka locally.

## Code standards

- Follow existing clean-architecture boundaries (`pnpm architecture`).
- Keep domain code free of NestJS, Prisma, and infrastructure imports.
- Use ports in application layer; implement adapters in infrastructure.
- Run `make ci` locally before opening a pull request.

## Pull request checklist

- [ ] Tests added or updated for behavior changes
- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` and `pnpm format:check` pass
- [ ] OpenAPI spec updated if HTTP contracts changed (`pnpm openapi:generate`)
- [ ] No AI tool attribution strings in source or docs (`pnpm attribution:scan`)
- [ ] Documentation updated for user-visible changes

## Commit messages

Use clear, imperative subjects focused on **why** the change matters. Example: `Add refresh token reuse detection outbox events`.

## Scope

This is a portfolio reference — keep changes focused and avoid claims of regulatory certification.
