FROM node:24.20-bookworm-slim AS base

WORKDIR /app

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable

FROM base AS dependencies

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

RUN pnpm install --frozen-lockfile

FROM dependencies AS builder

COPY . .

RUN pnpm exec prisma generate --config prisma7.config.ts
RUN pnpm build

FROM dependencies AS migration

COPY prisma ./prisma
COPY prisma7.config.ts ./
COPY scripts/seed-rbac.ts ./scripts/seed-rbac.ts
COPY --from=builder /app/src/generated ./src/generated

CMD ["sh", "-c", "pnpm exec prisma migrate deploy --config prisma7.config.ts && pnpm run seed:rbac"]

FROM base AS production-dependencies

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod

FROM base AS runtime

ENV NODE_ENV=production

COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

COPY package.json ./

USER node

EXPOSE 3000

CMD ["node", "--import", "./dist/telemetry/instrumentation.js", "./dist/main.js"]
