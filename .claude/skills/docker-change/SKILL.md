---
name: docker-change
description: Rules and tests for changing Nowoll's Docker images, compose files, Nginx config, deploy.sh or the $0-trial preview setup (infrastructure/). Use before editing anything under infrastructure/, .dockerignore, or next.config output settings, and before building or running images locally.
---

# Change Docker, compose, Nginx or deploy.sh

Guides: `docs/deployment.md` (VPS), `docs/preview.md` (the $0 trial on Rafi's PC),
`docs/integrations/cloudflare.md`. Everything runs twice on one VPS (staging + production) behind one Nginx.

## Never

- **Never use the compose project name `nowoll`.** It is Rafi's local dev setup (Postgres, Redis, Mailpit);
  `up --remove-orphans` under that name deletes those containers. Names in use: `nowoll-production`,
  `nowoll-staging`, `nowoll-edge`, `nowoll-preview`, `nowoll-preview-edge`; tests use their own
  (e.g. `nowolldeploytest`). Never `down -v` a project that shares volume names with dev.
- Never bake a secret into an image (build args are for public `NEXT_PUBLIC_*` values only).
- Never run migrations from a container — CI does (`deploy-to.yml`, `db-tasks.yml`).

## Test from a clean copy of git (this is what CI and the VPS get)

Files that exist only on this PC (gitignored `dist/`, `public/demo/`, empty folders git doesn't keep) make
local builds pass while CI fails. Build from what git contains:

```bash
D=<scratch dir>; rm -rf $D/clean && mkdir -p $D/clean && git archive HEAD | tar -x -C $D/clean
# copy in any uncommitted files you're testing, then:
cd $D/clean && docker build -f infrastructure/docker/<x>.Dockerfile … .
```

## Build and run locally

- One image at a time, in the background (WSL memory; a parallel build once restarted WSL).
- "error getting credentials" (Docker Desktop's Windows helper): use an empty config for the build —
  `mkdir -p $D/dockercfg && echo '{}' > $D/dockercfg/config.json && export DOCKER_CONFIG=$D/dockercfg`.
- Docker Desktop port forwarding sometimes refuses ports (80, 8099…): test from **inside** a Docker network
  (a `curlimages/curl` or `node` container on the same network) instead of host ports.
- A full local run of the deploy: a `registry:2.8.3` container on `localhost:5000` stands in for ghcr.io;
  `deploy.sh` takes `NOWOLL_BASE`, `NOWOLL_COMPOSE_OVERRIDE`, `NOWOLL_EDGE_OVERRIDE` for tests.

## Check every image

- runs as `node` (`docker run --rm --entrypoint id <img> -un`)
- no `.env*`, `*.pem`, `*.key`, `.git`, source or tests inside (`find / -xdev …`)
- size noted (API ~730 MB, workers ~650 MB, shop/admin ~425 MB)
- the shop/admin: only `.next/cache` and `.next/server/app` writable; `NEXT_PUBLIC_*` really baked in
  (grep the built `.next/static` chunks)

## Nginx

- `nginx -t` with the template rendered (`20-envsubst-on-templates.sh`), a throwaway self-signed cert in
  `live/nowoll/` and an htpasswd file.
- Behaviour tests in a throwaway network with stand-in apps: trial password (401/200), staging always
  protected, `www` → plain, unknown host refused, faked `CF-Connecting-IP` ignored.
- The htpasswd file must stay readable (644) — nginx runs as uid 101; `600` = 500 on every visit.
- Upstreams use `resolve` (nginx ≥ 1.27.3, pinned) — containers get new addresses on every deploy.

## Clean up afterwards

Remove test containers, volumes, networks, registry and images (only the test projects, by name). Then
confirm the dev containers and the `nowoll_postgres_data` volume are untouched.
