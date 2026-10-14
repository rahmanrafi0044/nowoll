# Deployment — the API and workers on the VPS

**Steps 44–46.** The **API** and the two **workers** run in Docker on the Hostinger VPS, behind **Nginx**
(HTTPS). The **database** is Supabase; the **shop and admin** are on Vercel (step 48).

| File | What |
|---|---|
| `infrastructure/docker/api.Dockerfile` | the API image (NestJS) |
| `infrastructure/docker/worker.Dockerfile` | a worker image (`--build-arg WORKER=order-worker` or `notification-worker`) |
| `infrastructure/deployment/docker-compose.prod.yml` | everything that runs on the VPS |
| `infrastructure/nginx/nowoll.conf.template` | Nginx for `api.nowoll.com` (the domain is filled in from `API_DOMAIN`) |
| `.env.production.example` | every setting the server needs — **no real values** |
| `.dockerignore` | keeps `.env` files, keys, certificates, git history and tests out of every image |

## What runs where

```
internet ──443/80──▶ nginx ──▶ api:3001 ──▶ Supabase (database, photos)
                                  │
                         redis (private) ◀── order-worker, notification-worker ──▶ Resend, Meta
```

- Only **nginx** has open ports (80, 443). The API, workers and Redis are on a private Docker network.
- **Redis** needs a password, saves its data to disk (queued jobs survive a restart) and never throws away a
  job to free memory (`noeviction`).
- Containers run as a **non-root** user with **read-only** files (only `/tmp` writable), restart by themselves,
  have **memory limits** (API 512 MB, workers 256 MB each, Redis 128 MB, Nginx 64 MB — for a 2–4 GB VPS)
  and **rotate their logs** (max 30 MB per service).
- **Secrets** live only in `/opt/nowoll/.env` on the server (`chmod 600`). Images never contain them.
- **Database migrations are not run by the containers** — CI runs `prisma migrate deploy` (step 47,
  CLAUDE.md Rules 4 and 7). Until then: run it once by hand from your own computer before starting a new
  version that has a migration (see below).

## First setup on the VPS (Rafi, once)

1. **Ubuntu + Docker:** install Docker Engine and the compose plugin (https://docs.docker.com/engine/install/ubuntu/).
   Open only ports 22, 80 and 443 in the firewall (`ufw allow OpenSSH 80 443 && ufw enable`).
2. **DNS:** an `A` record `api.nowoll.com` → the VPS's IP address.
3. **The code:** `sudo mkdir -p /opt/nowoll && cd /opt/nowoll && git clone <repo> app`
4. **The settings:** `cp app/.env.production.example /opt/nowoll/.env`, fill in every value, then
   `chmod 600 /opt/nowoll/.env`. (`REDIS_PASSWORD`: `openssl rand -hex 32`.)
5. **The first HTTPS certificate** (step 49 — before Nginx can start with HTTPS).
6. **Start everything:**
   ```bash
   cd /opt/nowoll/app
   docker compose -f infrastructure/deployment/docker-compose.prod.yml --env-file /opt/nowoll/.env up -d --build
   docker compose -f infrastructure/deployment/docker-compose.prod.yml ps   # all "healthy" / "running"
   curl https://api.nowoll.com/api/v1/health                            # {"success":true,...}
   ```

## A new version

```bash
cd /opt/nowoll/app && git pull
# If the version has a database migration (until step 47 automates it):
#   from YOUR computer, with the production DATABASE_URL: pnpm --filter @nowoll/database exec prisma migrate deploy
docker compose -f infrastructure/deployment/docker-compose.prod.yml --env-file /opt/nowoll/.env up -d --build
```

Logs: `docker compose -f infrastructure/deployment/docker-compose.prod.yml logs -f api` (or `order-worker`,
`notification-worker`, `nginx`).

## Nginx (step 46)

- Port **80**: only Let's Encrypt's check (`/.well-known/acme-challenge/`) — everything else redirects to HTTPS.
- Port **443**: TLS 1.2/1.3, HSTS (2 years); the API's own Helmet adds the other security headers.
- Only `/api/` is passed to the API; anything else is 404.
- Uploads up to **6 MB** (photos are max 5 MB — the API checks).
- An outer limit of **20 requests/second per visitor** (bursts of 40); the API keeps its finer limits.
- The visitor's real address is passed on (`X-Forwarded-For`); the API trusts exactly this one proxy.
- SSLCommerz payment notifications reach `/api/v1/payments/…` unchanged.
- The template is mounted as `default.conf`, so it **replaces** the image's stock "Welcome to nginx" site —
  someone opening the server by its IP address is sent to HTTPS, never shown a default page.
- Exactly one HSTS header: Nginx hides the API's own (shorter) one.

## Checked locally (how steps 44–46 were verified)

All three images built (API ~730 MB, each worker ~650 MB). The whole production setup then ran on a
developer machine with dummy settings, a self-signed certificate and the local Docker database:

- health through Nginx over HTTPS → 200 (`"database":"up"`); anything outside `/api/` → 404
- HTTP → HTTPS (301), also for an unknown host / bare IP; a Let's Encrypt check file is served on port 80
- `nginx -t` passes; one HSTS header; rate limit answers 429 past the burst
- both workers running (`emails via resend`); they **refuse to start** if `EMAIL_ADMIN` or a real
  `RESEND_API_KEY` is missing — fill them in before the first start
- every app container runs as `node` (not root) and can't write its own files
- Redis has no published port and refuses commands without the password
- no `.env`, keys, source code, tests or git history inside the images
- memory at rest: API ~135 MB, workers ~65–125 MB, Redis and Nginx ~10 MB each

## Still to come

- **Step 47** — CI/CD: build and deploy from GitHub; migrations in CI.
- **Step 48** — Vercel: the shop and admin.
- **Step 49** — the first HTTPS certificate and the Nginx reload after renewals.
