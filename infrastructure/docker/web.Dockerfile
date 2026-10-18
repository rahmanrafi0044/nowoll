# ============================================================================
# The shop or the admin panel (Next.js) — step 48. Build from the REPO ROOT:
#   docker build -f infrastructure/docker/web.Dockerfile \
#     --build-arg APP=storefront --build-arg NEXT_PUBLIC_API_URL=https://api.nowoll.com … .
#
# APP: storefront | admin. The NEXT_PUBLIC_* values are BAKED INTO the browser
# code at build time (Next.js rule), so staging and production each get their
# own image of the same commit (built by deploy.yml). They are public by
# design (they end up in every visitor's browser) — never put a secret here.
# Server-only settings (API_INTERNAL_URL, INTERNAL_API_KEY, COOKIE_PREFIX) come
# from docker-compose.prod.yml when the container starts.
#
# Two stages: "build" has every tool; "run" gets only Next.js's standalone
# output (server.js + the files it really uses), so no source, tests or tools.
# Files kept out of the build: web.Dockerfile.dockerignore (next to this file).
# ============================================================================

FROM node:26-slim AS build
ENV CI=1 NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /repo

# Packages first (cached until pnpm-lock.yaml changes), then the code.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm fetch
COPY . .

# The shared types package uses the database package's generated types, and
# generating them needs SOME database address — a dummy one, only here in the
# build stage. The shop and admin never connect to the database.
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build

ARG APP
RUN test "$APP" = storefront || test "$APP" = admin || (echo "APP must be storefront or admin" && exit 1)
RUN pnpm install --offline --frozen-lockfile --filter "@nowoll/${APP}..."
# public/ may hold no tracked files (git doesn't keep empty folders) — the run
# stage copies it, so make sure it exists.
RUN mkdir -p "apps/${APP}/public"

# Public settings, baked into the browser code (see above).
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_ADMIN_URL
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_OUTPUT=standalone
# The shared packages first (in order), then the app — pnpm follows the "..." graph.
RUN pnpm --filter "@nowoll/${APP}..." run build

FROM node:26-slim AS run
ARG APP
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
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

# The standalone server, plus the browser files and public/ (Next.js leaves
# those two out of standalone on purpose — docs: output → standalone).
COPY --from=build /repo/apps/${APP}/.next/standalone ./
COPY --from=build /repo/apps/${APP}/.next/static ./apps/${APP}/.next/static
COPY --from=build /repo/apps/${APP}/public ./apps/${APP}/public

# Everything belongs to root, so the app can't change its own code. Writable
# for the app ONLY: its cache (.next/cache — fetched data, resized photos) and
# the pages it re-creates every 60 s (ISR, in .next/server/app).
RUN mkdir -p apps/${APP}/.next/cache \
 && chown -R node:node apps/${APP}/.next/cache apps/${APP}/.next/server/app

USER node
WORKDIR /app/apps/${APP}
EXPOSE 3000

# Healthy = the server answers (the admin answers "/" with a redirect to sign-in).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/',{redirect:'manual'}).then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))"]
CMD ["node", "server.js"]
