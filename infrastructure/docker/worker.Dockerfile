# syntax=docker/dockerfile:1
# ============================================================================
# A background worker (BullMQ — CLAUDE.md §10) — step 44. One file for both:
#   docker build -f infrastructure/docker/worker.Dockerfile \
#     --build-arg WORKER=order-worker -t nowoll-order-worker .
#   (WORKER = order-worker | notification-worker)
# Same two-stage build as the API (see api.Dockerfile). No secrets in the
# image; no migrations here (CI does them).
# ============================================================================

FROM node:24-slim AS build
ARG WORKER
ENV CI=1 \
    TURBO_TELEMETRY_DISABLED=1 \
    DATABASE_URL=postgresql://build:build@localhost:5432/build
RUN test -n "$WORKER" || (echo "Set --build-arg WORKER=order-worker or notification-worker" && exit 1)
RUN corepack enable
WORKDIR /repo
# Packages first, from the lockfile alone: this slow step is reused (cached)
# until pnpm-lock.yaml changes — a code change doesn't download them again.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm fetch
COPY . .
RUN pnpm install --offline --frozen-lockfile --filter "@nowoll/${WORKER}..."
RUN pnpm --filter "@nowoll/${WORKER}..." run build
RUN pnpm --filter "@nowoll/${WORKER}" deploy --prod --ignore-scripts /out
# Build-time tools that pnpm keeps because Prisma's client lists them as
# "peers": the Prisma CLI and its database studio, a test database (pglite),
# TypeScript — ~230 MB the running app never loads (it only needs the
# generated client). Plus sharp's Alpine (musl) files: this image is Debian.
# (The image is checked by starting it against a database — docs/deployment.md.)
RUN cd /out/node_modules/.pnpm \
 && rm -rf prisma@* @prisma+studio-core@* @electric-sql+pglite@* typescript@* \
           @img+sharp-libvips-linuxmusl-* @img+sharp-linuxmusl-* \
 && find /out/node_modules -xtype l -delete

FROM node:24-slim AS run
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out/package.json ./package.json
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /out/dist ./dist
USER node
# Workers have no web port: healthy = the process is running (Docker restarts it if it stops).
CMD ["node", "dist/main.js"]
