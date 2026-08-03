# syntax=docker/dockerfile:1

FROM node:22-alpine AS deps
WORKDIR /app
ENV HUSKY=0
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
COPY package.json pnpm-lock.yaml ./
COPY prisma/schema.prisma ./prisma/schema.prisma
COPY scripts/setup-husky.mjs ./scripts/setup-husky.mjs
RUN pnpm install --frozen-lockfile

FROM deps AS build
WORKDIR /app
COPY . .
RUN rm -f tsconfig.build.tsbuildinfo \
  && pnpm prisma generate \
  && pnpm build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV HUSKY=0
RUN addgroup -g 1001 -S app && adduser -S app -u 1001 -G app \
  && corepack enable && corepack prepare pnpm@9.15.4 --activate
COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma
COPY scripts/setup-husky.mjs ./scripts/setup-husky.mjs
COPY scripts/worker-healthcheck.sh ./scripts/worker-healthcheck.sh
# Production install regenerates Prisma Client via @prisma/client postinstall.
RUN chmod +x ./scripts/worker-healthcheck.sh \
  && pnpm install --frozen-lockfile --prod \
  && chown -R app:app /app
COPY --from=build --chown=app:app /app/dist ./dist
USER app
EXPOSE 3000
# Default HEALTHCHECK targets the API HTTP process. The Compose `worker` service
# overrides this with scripts/worker-healthcheck.sh (heartbeat file freshness).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/health/live || exit 1
CMD ["node", "dist/main.js"]
