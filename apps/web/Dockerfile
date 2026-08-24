FROM node:22.23.1-alpine AS base

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
WORKDIR /workspace

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

FROM base AS development

# Pre-populate the named node_modules volume used by compose.yaml. The source
# bind mount then supplies live edits without putting dependencies in Git.
COPY . .
RUN --mount=type=cache,id=itqanak-pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile
CMD ["pnpm", "--filter", "@itqanak/web", "dev"]

FROM base AS build

COPY . .
RUN --mount=type=cache,id=itqanak-pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile
RUN pnpm turbo run build --filter=@itqanak/web...

FROM node:22.23.1-alpine AS runner

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
WORKDIR /app

RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 --ingroup nodejs nextjs

# Next's standalone output contains the traced runtime dependencies. Static and
# public assets are copied separately because Next intentionally excludes them.
COPY --from=build --chown=nextjs:nodejs /workspace/apps/web/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /workspace/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=nextjs:nodejs /workspace/apps/web/public ./apps/web/public
COPY --from=build --chown=nextjs:nodejs /workspace/migrations ./migrations

ENV MIGRATIONS_DIR=/app/migrations
ENV VERIFY_SCHEMA_ON_STARTUP=true

USER nextjs
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
