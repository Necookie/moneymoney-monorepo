# syntax=docker/dockerfile:1.7
# Money Money API — multi-stage build from the monorepo root:
#   docker build -f infra/docker/api.Dockerfile -t moneymoney-api .

ARG NODE_IMAGE=node:24-alpine

FROM ${NODE_IMAGE} AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true
RUN corepack enable
WORKDIR /repo

# ── Install (cached on manifests only) ─────────────────────────────────────
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/config/package.json packages/config/
COPY packages/types/package.json packages/types/
COPY packages/finance-engine/package.json packages/finance-engine/
COPY packages/validation/package.json packages/validation/
COPY packages/database/package.json packages/database/
COPY apps/api/package.json apps/api/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter "@mm/api..."

# ── Build and prune to production dependencies ─────────────────────────────
FROM deps AS build
COPY packages/config packages/config
COPY packages/types packages/types
COPY packages/finance-engine packages/finance-engine
COPY packages/validation packages/validation
COPY packages/database packages/database
COPY apps/api apps/api
RUN pnpm --filter "@mm/api..." build \
 && pnpm --filter @mm/api deploy --prod --legacy /out \
 && rm -rf /out/src /out/test /out/tsconfig*.json /out/eslint.config.js

# ── Runtime ────────────────────────────────────────────────────────────────
FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3001
RUN apk add --no-cache tini wget
WORKDIR /app
COPY --from=build --chown=node:node /out ./
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3001/ready >/dev/null || exit 1
ENTRYPOINT ["/sbin/tini", "--"]
# Migrations run first (advisory-locked, idempotent), then the server starts.
CMD ["sh", "-c", "node dist/migrate.js && exec node dist/server.js"]
