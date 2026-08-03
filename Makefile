PNPM ?= pnpm
DOCKER_COMPOSE ?= docker compose

.PHONY: install dev test typecheck lint format format-check architecture openapi-generate openapi-check attribution docker-up docker-down docker-build migrate seed keys clean

install:
	corepack enable
	corepack prepare pnpm@9.15.4 --activate
	$(PNPM) install

dev:
	$(PNPM) start:dev

test:
	$(PNPM) test

test-coverage:
	$(PNPM) test:coverage

typecheck:
	$(PNPM) typecheck

lint:
	$(PNPM) lint

format:
	$(PNPM) format

format-check:
	$(PNPM) format:check

architecture:
	$(PNPM) architecture

openapi-generate:
	$(PNPM) openapi:generate

openapi-check:
	$(PNPM) openapi:check

attribution:
	$(PNPM) attribution:scan

docker-env:
	node scripts/ensure-compose-env.mjs

docker-up: docker-env
	$(DOCKER_COMPOSE) up -d --build

docker-down:
	$(DOCKER_COMPOSE) down

docker-build:
	docker build -t financial-api-platform:local .

docker-smoke: docker-env
	node scripts/docker-smoke.mjs

migrate:
	$(PNPM) prisma:migrate:deploy

migrate-dev:
	$(PNPM) prisma:migrate:dev

seed:
	$(PNPM) exec prisma db seed

keys:
	node scripts/generate-dev-keys.mjs

keys-compose:
	node scripts/ensure-compose-env.mjs --force

prisma-generate:
	$(PNPM) prisma:generate

prisma-validate:
	$(PNPM) prisma:validate

clean:
	rm -rf dist coverage

ci: install prisma-generate prisma-validate typecheck lint format-check architecture test-coverage openapi-check attribution
