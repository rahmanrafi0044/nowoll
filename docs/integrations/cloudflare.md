# Cloudflare Integration Contract

## Overview

**Step 48.** Cloudflare (free plan) sits in front of the VPS. It caches photos and code files near
Bangladesh, hides the VPS's address and blocks attacks. The domain stays registered at **Namecheap**; only
its **DNS** moves to Cloudflare.

```
visitor ──▶ Cloudflare (cache, protection) ──▶ Nginx on the VPS ──▶ shop / admin / API
```

## Facts checked against Cloudflare's docs (16 Oct 2026)

| What | Fact | Source |
|---|---|---|
| SSL mode | **Full (strict)**, "whenever possible". The origin needs an unexpired certificate from a public CA (Let's Encrypt qualifies) that names the hostname, and HTTPS on port 443. Otherwise visitors get error 526. | developers.cloudflare.com → SSL → "Full (strict)" |
| Moving DNS | Add the domain, review the records, then change the nameservers at the registrar. **Turn off DNSSEC at the registrar first**: "Changing nameservers while DNSSEC is active can cause your domain to become unreachable". Re-enable DNSSEC in Cloudflare afterwards. Activation can take up to 24 hours. | developers.cloudflare.com → DNS → "Full setup" |
| Visitors' real IP | Nginx `set_real_ip_from <each Cloudflare range>` + `real_ip_header CF-Connecting-IP`. The ranges are published at https://www.cloudflare.com/ips, and the list "needs to be updated regularly". | developers.cloudflare.com → "Restoring original visitor IPs" |

## How Nowoll uses it

- **`infrastructure/nginx/cloudflare-real-ip.conf`** lists Cloudflare's ranges (fetched 16 Oct 2026) and
  restores the visitor's real address. The API's rate limits and the Meta Conversions API need the real
  address. Without this, every visitor would look like Cloudflare. Requests from anywhere else keep their own
  address, so nobody can fake one with that header (tested).
- **What Cloudflare caches:** code files (`/_next/static/…`, cached for a year by Next.js) and photos. Pages are
  **not** cached by Cloudflare. Next.js already rebuilds them every 60 seconds on the server, and pages must
  never be cached when they contain someone's cart or account.
- **Keeping the IP list current** (every few months, and at launch):
  ```bash
  curl -s https://www.cloudflare.com/ips-v4; curl -s https://www.cloudflare.com/ips-v6
  ```
  Compare with `cloudflare-real-ip.conf`. If they differ, ask Claude to update the file (a normal PR → staging →
  promote).

**During the $0 trial** (step 48b, `docs/preview.md`) the same domain points to a **Cloudflare Tunnel** from Rafi's
PC instead of `A` records. Checked against Cloudflare's docs (17 Oct 2026): Tunnel works on all plans and connects
out, so no open ports are needed. Each route's **Additional application settings → TLS** has **Origin Server Name**
and **Disable TLS certificate verification** (the PC's nginx uses a self-signed certificate).

## Setup (Rafi, once; before step 49)

1. **Cloudflare account** (free) → **Domains → Onboard a domain** → `nowoll.com` → **Free** plan.
2. **Namecheap → Domain List → nowoll.com:** if **DNSSEC** is on, turn it **off** first.
3. **Namecheap → Nameservers → Custom DNS:** replace them with the **two Cloudflare nameservers** from step 1,
   copied exactly. Wait until Cloudflare says **Active** (often within an hour, up to 24 hours).
4. **Cloudflare → DNS → Records:** `A` records pointing to the VPS's IP address, all **Proxied** (orange cloud):
   `nowoll.com` (`@`), `www`, `admin`, `api`, `staging`, `admin.staging`, `api.staging`.
   Keep any email records (MX, SPF, DKIM — e.g. Resend's) as Cloudflare found them. Email records are
   always "DNS only".
5. **Cloudflare → SSL/TLS → Overview:** **Full (strict)**. Do this only once the Let's Encrypt certificate is
   on the VPS (step 49). Until then, keep the records "DNS only" (grey cloud) so certbot can work directly.
6. **Leave "Always Use HTTPS" off** in Cloudflare. Nginx already redirects to HTTPS, and Let's Encrypt's check
   must reach port 80 unchanged.
7. Re-enable **DNSSEC** in Cloudflare (DNS → Settings), if you use it.

---

*Claude Code: read this file before any Cloudflare-related change. If Cloudflare's docs disagree with it, update
this file and tell Rafi.*
