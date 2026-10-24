# Security audit — OWASP Top 10 (step 53, October 2026)

Checked against the [OWASP Top 10 (2021)](https://owasp.org/Top10/), the standard list of the most common web
security failures, over the whole shop: the API, the shop and admin websites, the workers, the Docker images,
CI/CD and the VPS setup. **Result: no high-severity problem; two medium findings fixed; dependency and image
findings fixed or accepted with a reason; tests added so the important rules can't quietly break later.**

| # | Finding | Severity | Status |
|---|---|---|---|
| 1 | The public order receipt showed the customer's name and street address to anyone with the order id, **forever** — and that id travels in the confirmation page's address (history, screenshots, analytics) | Medium | **Fixed**: answers for 24 hours only |
| 2 | **No shop Content-Security-Policy** (the admin had one) | Medium | **Fixed**: CSP on every shop page |
| 3 | Failed admin sign-ins left **no trace** (wrong password, customer account, wrong 2FA code) | Low–Medium | **Fixed**: logged, email partly hidden |
| 4 | Docker images: Debian `perl-base` fixes missing (3 critical, 4 high), `npm` bundled in the image with vulnerable `undici` / `brace-expansion` | Medium (images) | **Fixed**: security updates at build, npm removed |
| 5 | Dependencies: `mysql2`, `deepmerge-ts` (via Prisma's command-line tool), `braces` (via the linter) | Low (dev tools only) | `mysql2` **fixed**; the other two **accepted** (below) |
| 6 | GitHub Actions used movable tags (`@v5`) — whoever controls the tag controls our CI | Low | **Fixed**: pinned to exact commits; Dependabot proposes updates |
| 7 | No automatic dependency or image checks | Low | **Fixed**: Dependabot weekly + Trivy on every Docker PR |
| 8 | No error tracking / alerting (Sentry) | Low | **Open**: its own small step next (needs Rafi's free Sentry account) |

## A01 — Broken access control

- **Every route checked automatically:** `apps/api/test/route-locks.e2e-spec.ts` reads the real API's routes
  (162) with their locks. It fails if:
  - an `/admin/` route lacks either admin lock (signed-in staff with 2FA, and the role check);
  - **any** admin-locked route (46 live outside `/admin/`, e.g. `PATCH /products/:id`) lacks the role check;
  - a route without any sign-in lock appears that isn't on the **reviewed list of 40 open routes**.
- **The 40 open routes, reviewed:** catalogue, blog, pages, settings, shipping rates, health and redirects are
  public by nature. Sign-in, password reset, newsletter, discount check and order tracking are open but rate-limited
  (5/minute). SSLCommerz's notifications are verified with SSLCommerz (A08). The Resend webhook is signature-checked.
  The receipt and payment status are reached by an unguessable order id (finding 1).
- **Added in 38f:** `POST /stock-alerts` ("Notify me when it's back") — open so shoppers need no account;
  rate-limited 5/minute per IP, only for sold-out sizes of products on sale, and it gives everyone the same answer
  (it never reveals who else asked). The emails sit in `stock_alerts` (RLS on, server-only).
- **Added (Steadfast, Phase 2):** `POST /webhooks/steadfast` — open because Steadfast's servers call it; a
  request is believed only when `Authorization: Bearer <token>` AND `X-Signature` (HMAC-SHA256 of the raw body)
  both match `STEADFAST_WEBHOOK_TOKEN` (constant-time). No token configured → 404. It can only move a SHIPPED
  order that we booked with Steadfast (matched by its consignment id) to DELIVERED, or add a note.
- **Finding 1 fixed:** `GET /orders/:id/receipt` answers for **24 hours** after the order (confirmation page,
  refresh, return from online payment), then "not found" — the same as a wrong id. Later, customers use
  **Track your order** (number + phone/email; no street address) or their account. The confirmation page now says
  so and links to tracking. `GET /payment/status/:orderId` reveals only the payment state — accepted.
- Customers can't open others' orders or addresses (existing tests: `my/:number` answers 404 for another's order).
- Staff role and ban are read from the database on **every** admin request, so revoking access works at once.

## A02 — Cryptographic failures / sensitive data

- Login cookies: `HttpOnly`, `SameSite=Strict`, `Secure` in production; HSTS (2 years) on all addresses.
- **No secret in any browser file:** both apps were built with the real `.env` and their 144 browser files searched
  for the actual value of all 11 server-only settings (service role key, Resend key, SSLCommerz password, database
  password, JWT secret…) — **none found**.
- **No secret in git history:** all 129 commits scanned with gitleaks 8.30.1 — 2 hits, both a false alarm (the
  empty `SSLCOMMERZ_STORE_PASSWORD=` line of the template, where the scanner read the next line as its value).
- No card numbers, bank numbers or government IDs stored (CLAUDE.md §7); payments are SSLCommerz's.

## A03 — Injection (SQL, XSS)

- **SQL:** ~35 raw queries, all Prisma tagged templates (`$queryRaw\`…${value}\``, `Prisma.sql`) — values are sent
  as parameters, never pasted into SQL. No `$queryRawUnsafe` / `$executeRawUnsafe`. The one user-chosen sort order
  picks from a fixed list.
- **XSS:** two `dangerouslySetInnerHTML` in the shop — the Google structured data (JSON-LD), which escapes `<`
  (`<`), and the fixed cookie-banner check (step 51, `consentCheckScript`: a constant, no visitor data). Markdown and emails don't take raw HTML (pasted HTML is on the never-admin-editable list, Rule 9).
  The new CSP (A05) limits what an injected script could load or send.

## A04 — Insecure design

- Rate limits: 100/min per visitor overall; 5/min on sign-in, password reset, payments, discount codes and
  newsletter; 30/min on receipt and payment status; Nginx adds 10 pages / 20 API calls per second per visitor.
  The shop's own server is exempt (shared secret, step 48) so pages never lose sections in a spike.
- Order + stock + payment record in one database transaction (CLAUDE.md §9; existing tests).

## A05 — Security misconfiguration

- **Finding 2 fixed — the shop's CSP** (`apps/storefront/src/lib/csp.ts`), **without nonces** (Rafi's decision): the
  Next.js 16 docs say nonces force every page to be built per visitor (no pre-built pages, no ISR). Scripts only from
  the shop, Google tag and Meta Pixel; data only to the API, Supabase and those two; no framing by other sites; no
  plugins; forms only to the shop. Inline scripts must be allowed ("unsafe-inline", Google's documented fallback),
  which makes it weaker against a script injected *into* our own pages — covered by A03. Hosts: Google's
  [CSP guide](https://developers.google.com/tag-platform/security/guides/csp) ("Analytics without Ads features");
  Meta publishes no CSP list, so its hosts are proven by a browser test (`tests/e2e/specs/csp.spec.ts`: no
  violation while browsing, buying, and after "Accept all" loads both scripts).
  - **No `eval`:** the browser test found Zod (the form checker) testing `new Function()` on every page. It is
    switched to its no-eval mode (`packages/validation/src/jitless.ts`), so the CSP can forbid eval outright.
  - If the owner later adds other tools through Google Tag Manager, their sites must be added to the CSP (a PR).
- Admin: strict nonce-based CSP (dynamic pages anyway). API: Helmet headers; CORS = exact list (`*` refused at
  start-up); errors never show internals (existing test); `x-powered-by` off.
- Nginx: only `/api/` proxied on the API address; unknown hosts refused at the TLS handshake; server version hidden.

## A06 — Vulnerable and outdated components

- `pnpm audit` before → after: 4 → 2 (both developer tools, never on the server):
  - `mysql2` (via Prisma's command-line tool) — **forced to 3.24.5** (`pnpm.overrides` in `package.json`).
  - `deepmerge-ts` 7.1.5 (via Prisma's command-line tool) — fixed in Prisma 7.10.1, released 15 Oct 2026; we wait
    until it's two weeks old, then Dependabot proposes it. **Accepted** meanwhile: not in the running apps.
  - `braces` (via the linter) — **no fixed version exists**; development only. **Accepted.**
- **Images (Trivy 0.75.0, fixable HIGH/CRITICAL):** the Debian base lacked `perl-base` security fixes even in the
  newest `node:24-slim`; `npm` inside the image carried `undici` / `brace-expansion` issues. All three Dockerfiles
  now install Debian's security updates at build time and **remove npm and corepack** (the running app never
  installs anything). Every Docker PR runs Trivy: a fixable **critical** finding fails the check.
- **Dependabot** (`.github/dependabot.yml`): weekly PRs for packages, actions and the base image — **minor and
  patch updates only**, each version at least **14 days old** (cooldown). Big version jumps (Node 26, ESLint 10…)
  are planned upgrades of their own. **Dependabot alerts and security updates** are on (repository Settings →
  Code security): a known hole gets its own PR as soon as a fix exists.

## A07 — Identification and authentication failures

- Admin: password **and** 2FA (TOTP); a password-only session opens nothing (API test + browser test, step 50);
  replacing the authenticator app needs more than a password (lost-phone command only); separate admin cookies.
- Sessions expire; refresh tokens rotate (single use); password-reset links work once (existing API tests).

## A08 — Software and data integrity

- SSLCommerz: every IPN is validated with SSLCommerz's validation API (`val_id`); a forged `status=VALID` changes
  nothing (existing test). The Resend webhook's signature is verified, replays refused (existing tests).
- **Finding 6 fixed:** every GitHub Action pinned to an exact commit (version noted beside it). The lockfile is
  frozen in CI; images are built in CI only, never on the server.

## A09 — Security logging and monitoring

- **Finding 3 fixed:** failed admin sign-ins are logged — wrong password, non-staff account, wrong 2FA code — with
  the email partly hidden (`o***@nowoll.com`), never the password or code (test in `admin-auth.e2e-spec.ts`).
  Staff changes already have their own history (Admin → Staff).
- **Finding 8, open:** nothing *alerts* yet — logs are only read when someone looks. **Next step: Sentry** (errors
  from the API, shop, admin and workers, plus these warnings), once Rafi creates the free account.

## A10 — Server-side request forgery

- The server never fetches an address a visitor typed. Outgoing calls go to fixed services (SSLCommerz, Meta,
  Resend, Supabase). Photos in blog posts must be our own uploads (step 43); `next/image` only resizes images
  from the configured Supabase project.

## The VPS (before step 49)

Recommended in `docs/deployment.md` for the first setup: SSH with keys only (password login off), the firewall
(22, 80, 443 only), and Ubuntu's automatic security updates (`unattended-upgrades`).

---

*Re-run this audit before launch and after any big change: the tests above keep most of it automatic.*
