# Deployment: the API and workers on the VPS

**Steps 44–47.** The **API** and the two **workers** run in Docker on the Hostinger VPS, behind **Nginx**
(HTTPS), twice: **staging** (every merge lands here first) and **production** (one click, after you've checked
staging). The **databases** are Supabase (one project each); the **shop and admin** are on Vercel (step 48).

| File | What |
|---|---|
| `infrastructure/docker/api.Dockerfile` | the API image (NestJS) |
| `infrastructure/docker/worker.Dockerfile` | a worker image (`--build-arg WORKER=order-worker` or `notification-worker`) |
| `infrastructure/deployment/docker-compose.prod.yml` | the app: API, workers, Redis (runs once for staging, once for production) |
| `infrastructure/deployment/docker-compose.edge.yml` | Nginx + certbot, shared by both |
| `infrastructure/nginx/nowoll.conf.template` | Nginx: `API_DOMAIN` → production, `STAGING_API_DOMAIN` → staging |
| `infrastructure/deployment/deploy.sh` | runs on the VPS for every deploy: restart, health check, automatic rollback |
| `.github/workflows/deploy.yml` | **Deploy to staging**: after every merge, build the images and deploy them to staging |
| `.github/workflows/promote.yml` | **Promote to production**: the one-click button |
| `.github/workflows/deploy-to.yml` | the deploy steps both of them use |
| `.github/workflows/docker-build.yml` | on PRs that touch Docker files: build the images, check compose/Nginx/deploy.sh |
| `.env.production.example` | every setting the server needs, with **no real values** |
| `.dockerignore` | keeps `.env` files, keys, certificates, git history and tests out of every image |

## What runs where

```
                       ┌─ api.nowoll.com ─────────▶ PRODUCTION  api ── redis ── 2 workers ──▶ Supabase "nowoll"
internet ─443/80─▶ nginx                              (/opt/nowoll, project "nowoll-production")
                       └─ api.staging.nowoll.com ─▶ STAGING     api ── redis ── 2 workers ──▶ Supabase "nowoll-staging"
                                                      (/opt/nowoll-staging, project "nowoll-staging")
```

- Only **nginx** has open ports (80, 443). Each copy's API, workers and Redis are on their own private Docker
  network; staging and production can't see each other's Redis or settings.
- **Redis** needs a password, saves its data to disk (queued jobs survive a restart) and never throws away a
  job to free memory (`noeviction`).
- Containers run as a **non-root** user with **read-only** files (only `/tmp` writable), restart by themselves,
  have **memory limits** (API 512 MB, workers 256 MB each, Redis 128 MB, Nginx 64 MB) and **rotate their logs**
  (max 30 MB per service). Both copies together use about 0.8 GB at rest: **choose a 4 GB VPS.**
- **Secrets** live only in `/opt/nowoll/.env` and `/opt/nowoll-staging/.env` on the server (`chmod 600`).
  Images never contain them.
- **Database migrations are not run by the containers.** The deploy workflow runs `prisma migrate deploy` just
  before the new version starts (CLAUDE.md Rules 4 and 7), on staging first, then on production when promoted.

## How a change reaches customers (step 47)

```
PR merged into main → CI passes →  "Deploy to staging" (deploy.yml), automatic
   build    the 3 images on GitHub → ghcr.io/rahmanrafi0044/nowoll-{api,order-worker,notification-worker}:<commit>
   staging  1. prisma migrate deploy on the STAGING database
            2. copies infrastructure/deployment + infrastructure/nginx to the VPS (/opt/nowoll-staging/app.new)
            3. deploy.sh staging: pull → restart → API healthy? workers running?
                   yes → done        no → ROLLBACK to the previous staging release, the run shows red
            4. checks https://api.staging.nowoll.com/api/v1/health from outside

you check staging (staging-api + the Vercel preview of the shop/admin)

GitHub → Actions → "Promote to production" → Run workflow   (promote.yml), ONE CLICK
   "commit" left empty → the commit staging runs now; the run's summary lists the changes going live
   production  the same 4 steps with the production database and /opt/nowoll, using the SAME images (no rebuild)
```

- **No code on the server.** The VPS gets only the compose files, the Nginx template and the images, not the
  source or git history. Nothing is built on the VPS, so a deploy doesn't slow the shop.
- **Nginx changes go live only with a production deploy.** A staging deploy starts Nginx only if it isn't running
  yet. A production deploy restarts Nginx (a second or two) so it picks up the new template.
- **Login to the image storage** lasts only for the deploy (GitHub's own short-lived token). No password for
  ghcr.io is stored on the server.
- **Roll back production:** "Promote to production" → type an older commit (from the Actions history or
  `git log`). The summary says **Rollback** and lists what is taken off. Staging: "Deploy to staging" → Run
  workflow with an older commit.
- **Migrations must be "two-step safe":** the migration runs while the *old* version is still serving. So a
  migration may add things (tables, columns with a default) but must not remove or rename what the running
  version uses. To remove a column, first ship code that no longer uses it, and drop the column in a **later**
  release. A rollback never undoes a migration. Staging gets every migration first, so a bad one is caught
  there.

## First setup (Rafi, once, with Claude's help at steps 48–49)

**Supabase:** a second project, **nowoll-staging** (free), next to the production one. Staging gets test data
only, never customer data.

**On the VPS** (4 GB RAM)
1. **Ubuntu + Docker:** install Docker Engine and the compose plugin (https://docs.docker.com/engine/install/ubuntu/).
   Open only ports 22, 80 and 443 in the firewall (`ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw enable`).
2. **A deploy user** (GitHub signs in as this user, never as root):
   ```bash
   sudo adduser --disabled-password --gecos "" deploy
   sudo usermod -aG docker deploy
   sudo mkdir -p /opt/nowoll /opt/nowoll-staging && sudo chown deploy:deploy /opt/nowoll /opt/nowoll-staging
   ```
3. **A deploy key**, made on YOUR computer, used only by GitHub:
   ```bash
   ssh-keygen -t ed25519 -N "" -C "github-deploy" -f nowoll_deploy
   # put nowoll_deploy.pub into /home/deploy/.ssh/authorized_keys on the VPS (mode 600, folder 700)
   ```
4. **DNS:** two `A` records → the VPS's IP address: `api.nowoll.com` and `api.staging.nowoll.com`.
5. **The settings:** two copies of `.env.production.example`, every value filled in, then `chmod 600` (owner `deploy`):
   - `/opt/nowoll/.env`: production (live SSLCommerz, the production Supabase project).
   - `/opt/nowoll-staging/.env`: staging. Use the **staging** Supabase project, SSLCommerz **sandbox**
     (`SSLCOMMERZ_IS_LIVE=false`), a different `REDIS_PASSWORD`, `META_CAPI_ACCESS_TOKEN` empty, staging
     addresses (`API_PUBLIC_URL=https://api.staging.nowoll.com`, …).
   - `REDIS_PASSWORD`: `openssl rand -hex 32`. `DATABASE_URL`: Supabase's **Session pooler** string
     (docs/integrations/supabase.md).
6. **The first HTTPS certificate**, **one certificate for both names** (step 49, before the first deploy,
   because Nginx needs it).

**On GitHub** (repo → Settings → Secrets and variables → Actions)

| Secret | Value |
|---|---|
| `VPS_HOST` | the VPS's IP address |
| `VPS_USER` | `deploy` |
| `VPS_SSH_KEY` | the whole content of the private key file `nowoll_deploy` (then delete it from your computer) |
| `VPS_KNOWN_HOSTS` | output of `ssh-keyscan -t ed25519 <VPS IP>`. Compare its fingerprint with Hostinger's console (`ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub` on the VPS) |
| `PROD_DATABASE_URL` | the same Session pooler string as in `/opt/nowoll/.env` |
| `STAGING_DATABASE_URL` | the same Session pooler string as in `/opt/nowoll-staging/.env` |

| Variable (not secret) | Value |
|---|---|
| `API_DOMAIN` | `api.nowoll.com` |
| `STAGING_API_DOMAIN` | `api.staging.nowoll.com` |
| `DEPLOY_ENABLED` | `true`. **The switch.** Until it is set, merges don't deploy (the run shows "Deploy is switched off"). |

Then, for the first time: **Actions → Deploy to staging → Run workflow** (branch `main`), check staging, then
**Actions → Promote to production → Run workflow**.

## Useful commands on the VPS

```bash
# production (for staging: /opt/nowoll-staging and -p nowoll-staging)
cd /opt/nowoll/app
alias nw='docker compose -p nowoll-production -f infrastructure/deployment/docker-compose.prod.yml --env-file /opt/nowoll/.env'
nw ps                         # all "healthy" / "running"
nw logs -f api                # or order-worker, notification-worker
cat release.env               # which commit is running
docker logs -f nowoll-edge-nginx-1   # nginx
```

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
- Nginx looks the API's address up again every 10 seconds (Docker's DNS). Each deploy creates a new API
  container with a new address; without this, Nginx would keep calling the old one (502 errors) until restarted.
  This needs Nginx 1.27.3 or newer, so the image version is pinned exactly.

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

### Step 47: deploy.sh, staging and production side by side

Tested with a local image registry instead of ghcr.io, both copies and the shared Nginx on one machine:

| Scenario | Result |
|---|---|
| First deploy, settings wrong (API refuses to start) | deploy fails, says there is no previous release |
| First staging deploy (Nginx not running yet) | staging healthy; Nginx started; production answers 502 (not deployed yet) |
| Promote to production | production healthy; Nginx restarted; staging still answers |
| New staging version | staging updated, **production unchanged** |
| Promote again | production updated, previous version kept for rollback |
| Broken API on staging | **staging rolled back automatically**, production untouched |
| Crashing worker on production | **production rolled back automatically**, staging untouched |

After every scenario both domains were checked through Nginx over HTTPS. All four workflows pass `actionlint`;
`deploy.sh` passes `shellcheck`.

## Still to come

- **Step 48** — Vercel: the shop and admin.
- **Step 49** — the first HTTPS certificate and the Nginx reload after renewals.
