FROM node:22.23.1-alpine AS base

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
WORKDIR /workspace

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

FROM base AS development

COPY . .
RUN --mount=type=cache,id=itqanak-pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile
CMD ["pnpm", "--filter", "@itqanak/worker", "dev"]

FROM base AS build

COPY . .
RUN --mount=type=cache,id=itqanak-pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile
RUN pnpm turbo run build --filter=@itqanak/worker...
RUN pnpm --filter @itqanak/worker deploy --prod /opt/worker

FROM node:22.23.1-alpine AS runner

ENV NODE_ENV=production
WORKDIR /app

COPY --from=build --chown=node:node /opt/worker ./

USER node
CMD ["node", "dist/index.js"]
