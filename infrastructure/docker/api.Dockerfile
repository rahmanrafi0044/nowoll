# syntax=docker/dockerfile:1
# ============================================================================
# The Nowoll API (NestJS) — step 44. Build from the REPO ROOT:
#   docker build -f infrastructure/docker/api.Dockerfile -t nowoll-api .
#
# Two stages ("multi-stage build"):
#   build — installs everything, compiles the API and the shared packages it
#           uses, then `pnpm deploy` copies ONLY the API's production packages
#   run   — a small image with just the compiled code + those packages
# No secrets are baked in: they come from the server's .env at run time
# (.dockerignore keeps every .env, key and certificate out of the build).
# Database migrations are NOT run here — CI runs `prisma migrate deploy`
# (CLAUDE.md Rules 4 and 7, step 47).
# ============================================================================

# node:24-slim (Debian), not Alpine: the photo library (sharp) and Prisma
# ship ready-made builds for it.
FROM node:26-slim AS build
ENV CI=1 \
    TURBO_TELEMETRY_DISABLED=1 \
    # Prisma's config needs a DATABASE_URL just to generate its code — no connection is made.
    DATABASE_URL=postgresql://build:build@localhost:5432/build
RUN corepack enable
WORKDIR /repo
# Packages first, from the lockfile alone: this slow step is reused (cached)
# until pnpm-lock.yaml changes — a code change doesn't download them again.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm fetch
COPY . .
# Only the API and what it depends on ("@nowoll/api..." = it and its workspace dependencies).
RUN pnpm install --offline --frozen-lockfile --filter "@nowoll/api..."
# Builds the shared packages first, then the API (pnpm runs them in dependency order).
RUN pnpm --filter "@nowoll/api..." run build
# A self-contained folder: the API's package.json + its PRODUCTION node_modules
# (workspace packages copied in as their built dist). --ignore-scripts: nothing
# runs at copy time (the Prisma client was generated and built above).
RUN pnpm --filter @nowoll/api deploy --prod --ignore-scripts /out
# Build-time tools that pnpm keeps because Prisma's client lists them as
# "peers": the Prisma CLI and its database studio, a test database (pglite),
# TypeScript — ~230 MB the running app never loads (it only needs the
# generated client). Plus sharp's Alpine (musl) files: this image is Debian.
# (The image is checked by starting it against a database — docs/deployment.md.)
RUN cd /out/node_modules/.pnpm \
 && rm -rf prisma@* @prisma+studio-core@* @electric-sql+pglite@* typescript@* \
           @img+sharp-libvips-linuxmusl-* @img+sharp-linuxmusl-* \
 && find /out/node_modules -xtype l -delete

FROM node:26-slim AS run
ENV NODE_ENV=production \
    PORT=3001
# Security audit (step 53, docs/security-audit.md): Debian's security fixes,
# even before the node:24-slim image is rebuilt with them (Trivy found perl-base
# fixes missing), and no npm / corepack: the running app never installs
# anything, and their bundled packages (undici, brace-expansion) had open CVEs.
RUN apt-get update \
 && apt-get upgrade -y --no-install-recommends \
 && rm -rf /var/lib/apt/lists/* \
 && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
           /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack
WORKDIR /app
# Owned by root, run as the unprivileged "node" user: the app can't change its own code.
COPY --from=build /out/package.json ./package.json
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /repo/apps/api/dist ./dist
USER node
EXPOSE 3001
# Healthy = the API answers its own health check.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node", "dist/main.js"]
