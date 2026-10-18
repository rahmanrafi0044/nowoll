# Deployment: the whole shop on the VPS

**Steps 44–48.** The **shop**, the **admin panel**, the **API** and the two **workers** run in Docker on one
Hostinger VPS, behind **Nginx** (HTTPS) and **Cloudflare** (free). Everything runs twice: **staging** (every merge
lands here first) and **production** (one click, after you've checked staging). The **databases**, logins and
photos are Supabase (one project each).

| File | What |
|---|---|
| `infrastructure/docker/api.Dockerfile` | the API image (NestJS) |
| `infrastructure/docker/worker.Dockerfile` | a worker image (`--build-arg WORKER=order-worker` or `notification-worker`) |
| `infrastructure/docker/web.Dockerfile` | the shop or admin image (`--build-arg APP=storefront` or `admin`), Next.js "standalone" |
| `infrastructure/deployment/docker-compose.prod.yml` | the app: shop, admin, API, workers, Redis (runs once for staging, once for production) |
| `infrastructure/deployment/docker-compose.edge.yml` | Nginx + certbot, shared by both |
| `infrastructure/nginx/` | `nowoll.conf.template` (all six addresses), `tls.conf`, `proxy-next.conf`, `cloudflare-real-ip.conf` |
| `infrastructure/deployment/deploy.sh` | runs on the VPS for every deploy: restart, warm-up, health check, automatic rollback |
| `.github/workflows/deploy.yml` | **Deploy to staging**: after every merge, build the images and deploy them to staging |
| `.github/workflows/promote.yml` | **Promote to production**: the one-click button |
| `.github/workflows/deploy-to.yml` | the deploy steps both of them use |
| `.github/workflows/docker-build.yml` | on PRs that touch Docker files: build the images, check compose/Nginx/deploy.sh |
| `.github/workflows/db-tasks.yml` | **Database tasks**: migrate, seed, grant / revoke admin, reset 2FA, for production or staging (buttons) |
| `infrastructure/preview/` | the **$0 trial** on Rafi's PC through a Cloudflare Tunnel (step 48b, `docs/preview.md`) |
| `.env.production.example` | every setting the server needs, with **no real values** |
| `.dockerignore`, `web.Dockerfile.dockerignore` | keep `.env` files, keys, certificates, git history and tests out of every image |
| `docs/integrations/cloudflare.md` | Cloudflare: facts checked against its docs, and the setup steps |

## What runs where

```
                                        ┌ nowoll.com, www ──────▶ PRODUCTION shop  ─┐
                                        ├ admin.nowoll.com ─────▶ PRODUCTION admin   ├─ api ── redis ── 2 workers ─▶ Supabase (Mumbai)
visitor ─▶ Cloudflare ─443/80─▶ nginx ──┤ api.nowoll.com ───────▶ PRODUCTION api  ──┘   /opt/nowoll · project "nowoll-production"
                                        ├ staging.nowoll.com ───▶ STAGING shop     ─┐
                                        ├ admin.staging… ───────▶ STAGING admin      ├─ api ── redis ── 2 workers ─▶ Supabase (Singapore)
                                        └ api.staging… ─────────▶ STAGING api     ──┘   /opt/nowoll-staging · project "nowoll-staging"
```

- Only **nginx** has open ports (80, 443). Each copy's containers are on their own private Docker network;
  staging and production can't see each other's Redis or settings.
- The **shop builds its pages** by asking the API over that private network (`http://api:3001`): no trip out to
  the internet and back. These calls carry a shared secret (`INTERNAL_API_KEY`), so the API doesn't count them
  against the per-visitor rate limit. Without it, during an ad spike the shop's own server would hit the
  limit and pages would lose sections.
- The **shop and admin don't get the `.env`**. They only receive `API_INTERNAL_URL`, `INTERNAL_API_KEY` (shop)
  and `COOKIE_PREFIX`, never database, payment or email secrets. Their public addresses are baked in at build
  time (GitHub variables, below).
- **Redis** needs a password, saves its data to disk (queued jobs survive a restart) and never throws away a
  job to free memory (`noeviction`).
- Containers run as a **non-root** user, restart by themselves, have **memory limits** (shop 384 MB, admin
  256 MB, API 512 MB, workers 256 MB each, Redis 128 MB, Nginx 64 MB) and **rotate their logs**. The API and
  workers are fully read-only. The shop and admin can write only their page/photo cache. Both copies together
  use about **1–1.5 GB at rest**: **Hostinger KVM 2 (8 GB)** has plenty of room.
- **Secrets** live only in `/opt/nowoll/.env` and `/opt/nowoll-staging/.env` on the server (`chmod 600`).
  Images never contain them.
- **Database migrations are not run by the containers.** The deploy workflow runs `prisma migrate deploy` just
  before the new version starts (CLAUDE.md Rules 4 and 7), on staging first, then on production when promoted.

## Caching: why pages are fast

A request stops at the first layer that already has the answer:

| Layer | What it keeps | For how long |
|---|---|---|
| Visitor's browser | code files (JS, CSS, fonts) | 1 year (each version has a new file name) |
| **Cloudflare** | photos and code files, near Bangladesh | until they change |
| **Next.js page cache (ISR)** | ready-made pages: home, products, blog, info pages | rebuilt in the background every **60 s** |
| **Next.js data cache** | the API's answers used to build pages | **60 s** per address |
| Next.js image cache | photos resized for each screen size | until the photo changes |
| **Never cached** | cart, checkout, account, orders, the whole admin | always fresh |

So 500 visitors opening the same product within a minute cost the database **about one** visit. A price
changed in the admin shows in the shop within about a minute.

**Warm-up:** right after starting a new version, `deploy.sh` asks the shop for `/`, `/shop` and `/blog` from
inside its container. Pages built into the image may be old (or empty, if GitHub couldn't reach the API while
building), and the first request starts a fresh rebuild. So the warm-up does that before a customer arrives.

## How a change reaches customers (step 47)

```
PR merged into main → CI passes →  "Deploy to staging" (deploy.yml), automatic
   build    on GitHub → ghcr.io/rahmanrafi0044/nowoll-…:<commit>
            api, order-worker, notification-worker, and the shop + admin for staging AND production
            (their public addresses are baked in, so each environment gets its own image)
   staging  1. prisma migrate deploy on the STAGING database
            2. copies infrastructure/deployment + infrastructure/nginx to the VPS (/opt/nowoll-staging/app.new)
            3. deploy.sh staging: pull → restart → warm-up → shop, admin, API healthy? workers running?
                   yes → done        no → ROLLBACK to the previous staging release, the run shows red
            4. checks the API, the shop and the admin from outside

you check staging.nowoll.com and admin.staging.nowoll.com (staging password)

GitHub → Actions → "Promote to production" → Run workflow   (promote.yml), ONE CLICK
   "commit" left empty → the commit staging runs now; the run's summary lists the changes going live
   production  the same 4 steps with the production database and /opt/nowoll, using the production
               images built at merge time (no rebuild)
```

- **No code on the server.** The VPS gets only the compose files, the Nginx files and the images, not the
  source or git history. Nothing is built on the VPS, so a deploy doesn't slow the shop.
- **Nginx changes go live only with a production deploy.** A staging deploy starts Nginx only if it isn't running
  yet. A production deploy restarts Nginx (a second or two) so it picks up the new files.
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

## The trial password (before launch)

While the owner reviews the site, the **production shop** asks for a username and password and tells search
engines not to list it (`SITE_PASSWORD=on` in `/opt/nowoll/.env`). **Staging** (shop and admin) always asks.
The production admin has its own sign-in + 2FA. The API stays open: SSLCommerz must reach it.

```bash
# on the VPS, as deploy — add a person (asks for their password twice):
docker run --rm -it httpd:2.4-alpine htpasswd -nB owner >> /opt/nowoll/htpasswd
# remove someone: delete their line in /opt/nowoll/htpasswd
```

The file holds only hashed passwords and must stay readable (`644`, never `600` like the `.env`): nginx reads it
as its own user, and a private file makes every visit fail with 500. `deploy.sh` sets it on every deploy.

Keep `-B`'s default strength: Nginx checks the password on every request (each page and file), so a
stronger setting would make every page slower during the trial.

**At launch:** set `SITE_PASSWORD=off` in `/opt/nowoll/.env`, then run "Promote to production" (with the current
commit) so Nginx restarts with it.

## First setup (Rafi, once, with Claude's help at step 49)

**Supabase:** staging = the existing project (Singapore). Production = a **new** project in **Mumbai**, next to
the VPS (docs/integrations/supabase.md). Staging gets test data only, never customer data.

**On the VPS** (Hostinger **KVM 2**, location **India**)
1. **Ubuntu + Docker:** install Docker Engine and the compose plugin (https://docs.docker.com/engine/install/ubuntu/).
   Open only ports 22, 80 and 443 in the firewall (`ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw enable`).
   **Hardening** (security audit, `docs/security-audit.md`):
   - Ubuntu's automatic security updates: `sudo apt install unattended-upgrades && sudo dpkg-reconfigure -plow unattended-upgrades`.
   - SSH with keys only, **after** you can sign in with your own key (otherwise you lock yourself out): set
     `PasswordAuthentication no` in `/etc/ssh/sshd_config`, then `sudo systemctl restart ssh`.
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
4. **DNS at Cloudflare** (docs/integrations/cloudflare.md): `A` records → the VPS's IP address for `nowoll.com`,
   `www`, `admin`, `api`, `staging`, `admin.staging`, `api.staging`.
5. **The settings:** two copies of `.env.production.example`, every value filled in, then `chmod 600` (owner `deploy`):
   - `/opt/nowoll/.env`: production (live SSLCommerz, the production Supabase project, `COOKIE_PREFIX=nw`).
   - `/opt/nowoll-staging/.env`: staging. Use the **staging** Supabase project, SSLCommerz **sandbox**
     (`SSLCOMMERZ_IS_LIVE=false`), a different `REDIS_PASSWORD` and `INTERNAL_API_KEY`,
     `META_CAPI_ACCESS_TOKEN` empty, `COOKIE_DOMAIN=.staging.nowoll.com`, `COOKIE_PREFIX=nws`, and staging
     addresses (`API_PUBLIC_URL=https://api.staging.nowoll.com`,
     `ALLOWED_ORIGIN=https://staging.nowoll.com,https://admin.staging.nowoll.com`, …).
   - `REDIS_PASSWORD`, `INTERNAL_API_KEY`: `openssl rand -hex 32` each. `DATABASE_URL`: Supabase's **Session
     pooler** string (docs/integrations/supabase.md).
6. **The trial password:** add yourself and the owner to `/opt/nowoll/htpasswd` (see above).
7. **The first HTTPS certificate**: **one certificate for all seven names**, named `nowoll` (step 49, before
   the first deploy, because Nginx needs it).

**On GitHub** (repo → Settings → Secrets and variables → Actions)

| Secret | Value |
|---|---|
| `VPS_HOST` | the VPS's IP address |
| `VPS_USER` | `deploy` |
| `VPS_SSH_KEY` | the whole content of the private key file `nowoll_deploy` (then delete it from your computer) |
| `VPS_KNOWN_HOSTS` | output of `ssh-keyscan -t ed25519 <VPS IP>`. Compare its fingerprint with Hostinger's console (`ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub` on the VPS) |
| `PROD_DATABASE_URL` | the same Session pooler string as in `/opt/nowoll/.env` |
| `STAGING_DATABASE_URL` | the same Session pooler string as in `/opt/nowoll-staging/.env` |
| `PROD_SUPABASE_SERVICE_ROLE_KEY`, `STAGING_SUPABASE_SERVICE_ROLE_KEY` | each project's service role key: only **Database tasks → reset-2fa** uses it |

| Variable (not secret; baked into the shop/admin) | Value |
|---|---|
| `SITE_DOMAIN`, `ADMIN_DOMAIN`, `API_DOMAIN` | `nowoll.com`, `admin.nowoll.com`, `api.nowoll.com` |
| `STAGING_SITE_DOMAIN`, `STAGING_ADMIN_DOMAIN`, `STAGING_API_DOMAIN` | `staging.nowoll.com`, `admin.staging.nowoll.com`, `api.staging.nowoll.com` |
| `PROD_SUPABASE_URL`, `PROD_SUPABASE_ANON_KEY` | the production project's URL and **anon** (public) key |
| `STAGING_SUPABASE_URL`, `STAGING_SUPABASE_ANON_KEY` | the staging project's URL and **anon** (public) key |
| `DEPLOY_ENABLED` | `true`. **The switch.** Until it is set, merges don't deploy (the run shows "Deploy is switched off"). |

The anon key is public by design (it's in every visitor's browser). **Never** put the service role key in a
variable; it stays a secret in the server's `.env`.

Then, for the first time: **Actions → Database tasks** (`seed`, each environment; the deploy runs the migrations),
**Actions → Deploy to staging → Run workflow** (branch `main`), check staging, then **Actions → Promote to
production → Run workflow**. The first admin: sign up on the shop, then **Database tasks → grant-admin**.

## Useful commands on the VPS

```bash
# production (for staging: /opt/nowoll-staging and -p nowoll-staging)
cd /opt/nowoll/app
alias nw='docker compose -p nowoll-production -f infrastructure/deployment/docker-compose.prod.yml --env-file /opt/nowoll/.env'
nw ps                         # all "healthy" / "running"
nw logs -f storefront         # or admin, api, order-worker, notification-worker
cat release.env               # which commit is running
docker logs -f nowoll-edge-nginx-1   # nginx
```

## Nginx (steps 46 and 48)

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
- **Step 48:** the shop (`www` → the plain address), the admin and the three staging addresses, with one
  certificate (`/etc/letsencrypt/live/nowoll/`). Pages: 10 per second per visitor (bursts of 40); code files
  aren't limited (cached by Cloudflare and the browser). An address that isn't ours (e.g. the bare IP) is
  refused at the HTTPS handshake.
- **Behind Cloudflare** the visitor's real address is restored (`cloudflare-real-ip.conf`); a faked header from
  anywhere else is ignored.

## Checked locally (how steps 44–48 were verified)

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

### Step 48: the shop and admin on the VPS

Built both images (shop 423 MB, admin 425 MB): they run as `node`, contain no `.env`, keys, source or tests, and
can write only their cache. Then the whole production setup (shop, admin, API, workers, Redis, Nginx) was
deployed by `deploy.sh` from a local image registry:

| Check | Result |
|---|---|
| Home page through Nginx (password given) | 200 in **18 ms** (from the page cache), 12 products shown |
| Product page, first visit / category page | 200 (335 ms, then cached) / 200 |
| Code files | `Cache-Control: public, max-age=31536000, immutable` |
| Trial password on | 401 without it, 200 with it, `X-Robots-Tag: noindex, nofollow` |
| Staging shop and admin | always 401 without the password; production admin: no extra password |
| `www` / an unknown address | 301 to the plain address / refused at the HTTPS handshake |
| Faked `CF-Connecting-IP` from a non-Cloudflare address | ignored |
| 130 API calls from the shop's server **with** the secret | 130 × 200 (not rate-limited) |
| 130 API calls **without** it (an ordinary visitor) | 100 × 200, then 30 × 429 |
| Page cache written | yes (`.next/cache`, 19 cached API answers after a few visits) |
| Broken shop in a new version | **rolled back automatically**, the shop kept answering 200 |
| Memory, whole production copy | ~520 MB at rest |

## Still to come

- **Step 49:** the VPS, Cloudflare and the first HTTPS certificate (one for all seven names, `--cert-name
  nowoll`), with the Nginx reload after renewals.
