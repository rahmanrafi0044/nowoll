# The $0 trial: Nowoll online from your PC

**Step 48b.** Until the VPS is rented (1–2 weeks before the ads), the **production setup runs on your PC**. The
owner opens it at the real addresses (`nowoll.com`, `admin.nowoll.com`) through a **Cloudflare Tunnel**, behind
the trial password. It's the same images and settings as the VPS, so what the owner sees is what customers
will get.

```
owner's phone → nowoll.com → Cloudflare → tunnel (connects OUT from your PC) → nginx → shop / admin / API
                                                                                        ↓
                                                         Supabase PRODUCTION project (Mumbai, free plan)
```

- **The products, photos and accounts you create now are the real ones.** They live in the production Supabase
  project, so nothing is uploaded twice when the VPS takes over.
- **It works only while your PC is on and Docker is running.** If it's off, the owner sees a Cloudflare error page.
- **No load test here.** Your home connection and 8 GB PC aren't the real server; that test happens on the VPS.
- Don't run `pnpm dev` at the same time (memory). The preview opens no ports on your PC, so the two never clash.

## One-time setup

### 1. Cloudflare and the domain
Follow `docs/integrations/cloudflare.md` → **Setup**, steps 1–3: account, add `nowoll.com`, nameservers at
Namecheap (DNSSEC off first). Then in **DNS → Records**, delete the `A`/`CNAME` records for `nowoll.com` (`@`)
and `www` if Cloudflare copied them from the old hosting. **Keep the email records** (`MX`, and `TXT` ones with
`spf` / `dkim`) if the old hosting runs your email.

### 2. The production Supabase project (Mumbai)
1. Supabase → **New project** → name `nowoll-production`, region **Mumbai** (`ap-south-1`), a strong database
   password, saved in a password manager.
2. Do the same dashboard setup as the dev project, per `docs/integrations/supabase.md`: the **photo bucket**
   (Storage) and **Authentication → URL Configuration** with `https://nowoll.com/reset-password`.
3. Note down, from **Connect** and **Project settings → API**: the **Session pooler** URI (with the
   password), the project URL, the **anon** key and the **service role** key (secret).

### 3. GitHub: the database buttons
Repo → **Settings → Secrets and variables → Actions**:

| Kind | Name | Value |
|---|---|---|
| Secret | `PROD_DATABASE_URL` | the Session pooler URI |
| Secret | `PROD_SUPABASE_SERVICE_ROLE_KEY` | the service role key (only "reset-2fa" uses it) |
| Variable | `PROD_SUPABASE_URL` | the project URL |
| Variable | `PROD_SUPABASE_ANON_KEY` | the anon key (public by design) |

Then **Actions → Database tasks → Run workflow**: environment `production`, task **migrate**. When it's green,
run it again with task **seed** (the starting settings, shipping zones and pages).

### 4. The Cloudflare Tunnel
Cloudflare dashboard → **Networking → Tunnels → Create a tunnel** → type **Cloudflared** → name
`nowoll-preview`. On the install page, copy the long token after `--token`. **Don't** run the install
command; Docker runs the tunnel.

Then the tunnel's **Routes** tab → **Add route** (a published application). Add one route for each of these
four addresses:

| Subdomain | Domain | Service |
|---|---|---|
| *(empty)* | `nowoll.com` | `HTTPS` · `nginx:443` |
| `www` | `nowoll.com` | `HTTPS` · `nginx:443` |
| `admin` | `nowoll.com` | `HTTPS` · `nginx:443` |
| `api` | `nowoll.com` | `HTTPS` · `nginx:443` |

For **each** route, open **Additional application settings → TLS**: **Origin Server Name** = `nowoll.com`, and
turn on **Disable TLS certificate verification**. Your PC's nginx uses a self-signed certificate; visitors
still get Cloudflare's real one.

### 5. The settings file on your PC
```bash
mkdir -p ~/nowoll-preview && cp .env.production.example ~/nowoll-preview/.env && chmod 600 ~/nowoll-preview/.env
```
Fill it in like the **production** file (docs/deployment.md), with these trial choices:
- `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`: the
  **production** project from step 2.
- `SITE_PASSWORD=on`, `COOKIE_PREFIX=nw`, `COOKIE_DOMAIN=.nowoll.com`.
- `SSLCOMMERZ_IS_LIVE=false` with the **sandbox** store, until the live account is approved.
- `RESEND_API_KEY`: a real key, with the sending domain verified in Resend (docs/integrations/resend.md). The
  workers refuse to start without one.
- `REDIS_PASSWORD`, `INTERNAL_API_KEY`: `openssl rand -hex 32` each.
- Add one line: `CLOUDFLARE_TUNNEL_TOKEN=<the token from step 4>`.

### 6. The trial password
```bash
docker run --rm -it httpd:2.4-alpine htpasswd -nB owner >> ~/nowoll-preview/htpasswd   # asks for the password
docker run --rm -it httpd:2.4-alpine htpasswd -nB rafi  >> ~/nowoll-preview/htpasswd
```
The file holds only scrambled (hashed) passwords. Unlike the `.env`, it must stay **readable** (`644`): nginx reads
it as its own user, and a private (`600`) file makes every visit fail with **500**. `preview.sh up` sets this.

### 7. Start it
```bash
infrastructure/preview/preview.sh build   # ~15 minutes the first time
infrastructure/preview/preview.sh up      # ends with "✓ tunnel connected to Cloudflare"
```
Open **https://nowoll.com**. The browser asks for the trial password.

### 8. The first admin
1. On **https://nowoll.com**, **sign up** with your email.
2. **Actions → Database tasks**: `production`, task **grant-admin**, your email.
3. Open **https://admin.nowoll.com/admin/login**, sign in, and scan the QR code with an authenticator app.
   Do the same for the owner (or use **grant-staff** for limited access).

## Every day

| What | Command (from the repo folder) |
|---|---|
| Start (after the PC restarts) | `infrastructure/preview/preview.sh up` |
| Is it running? Is the tunnel connected? | `infrastructure/preview/preview.sh status` |
| Logs | `infrastructure/preview/preview.sh logs storefront` (or `admin`, `api`, `nginx`, `tunnel`…) |
| Stop | `infrastructure/preview/preview.sh down` (the data is in Supabase; nothing is lost) |
| After a PR is merged | `git checkout main && git pull`, then **Database tasks → migrate** if it had a database change, then `preview.sh build` and `preview.sh up` |

## When the VPS takes over (step 49)
Cloudflare → the tunnel → delete its four routes (and then the tunnel). Add the `A` records that point to the VPS
(docs/integrations/cloudflare.md, step 4) and do the first deploy. The data is already in Supabase.
`preview.sh down` on your PC.

## If something is wrong
- **Cloudflare error 1033 / "tunnel error":** the tunnel isn't running. Run `preview.sh status`, then `preview.sh up`.
- **502 Bad Gateway:** a part didn't start. Run `preview.sh status`, then `preview.sh logs <that part>`.
- **"error getting credentials" while building:** a Docker Desktop credential problem on Windows. Run the
  build with an empty Docker config: `mkdir -p ~/.docker-nocreds && echo '{}' > ~/.docker-nocreds/config.json &&
  DOCKER_CONFIG=~/.docker-nocreds infrastructure/preview/preview.sh build`.
