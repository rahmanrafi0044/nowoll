# Supabase Integration Contract

## Overview
Nowoll uses Supabase for three things:

| Feature | Used by | Status |
|---|---|---|
| **PostgreSQL** (hosted database) | API via Prisma | Local Docker Postgres in dev; Supabase in production (Phase 7) |
| **Storage** (product images) | API only | ✅ Implemented — Phase 2 step 10 |
| **Auth** (login, 2FA) | API only (both apps sign in through it) | ✅ Customers — step 22 · ✅ Admin + 2FA — step 29a |

**Dashboard:** https://supabase.com/dashboard
**SDK:** `@supabase/supabase-js` (v2.117) — all calls below were checked against the installed SDK's type definitions, not written from memory.

---

## Credentials (root `.env` — never committed)

```env
NEXT_PUBLIC_SUPABASE_URL=       # project URL — public, used by browser apps AND the API
NEXT_PUBLIC_SUPABASE_ANON_KEY=  # public "anon" key — safe in browsers (RLS blocks it)
SUPABASE_SERVICE_ROLE_KEY=      # SERVER ONLY — bypasses RLS. API process only.
```

| Key | Where it may appear | What it can do |
|---|---|---|
| anon | storefront + admin bundles | Nothing on our tables (RLS on, no policies). Cannot upload images. |
| service role | `apps/api` only | Everything. Never in a `NEXT_PUBLIC_*` variable, never logged. |

The Next.js apps load **only** `NEXT_PUBLIC_*` values from `.env` (see each app's `next.config.ts`), so the service role key can't leak into a browser bundle by accident.

---

## Storage — product images

### Bucket

| Setting | Value | Why |
|---|---|---|
| Name | `product-images` | `PRODUCT_IMAGES_BUCKET` in `apps/api/src/storage/image-storage.ts` |
| Public | `true` | Browsers load photos directly from Supabase's CDN |
| File size limit | 5 MB | CLAUDE.md §11.7 — enforced by Supabase **and** by the API |
| Allowed MIME types | `image/jpeg`, `image/png`, `image/webp` | Same as the API's check |

Created and verified by **`pnpm storage:setup`** (idempotent — safe to re-run). The script:
1. creates the bucket, or updates an existing one to the settings above
2. uploads a 1×1 test PNG with the service key through the API's real adapter, fetches its public URL, deletes it
3. checks that the **anon** key **cannot** upload (fails loudly if it can)

Run it once per Supabase project (dev now; production before launch — see the launch checklist in `docs/00-master-spec.md`).

### Who can write
- **Uploads/deletes:** only the API, with the service role key, behind `@AdminOnly()` routes.
- **Storage RLS:** no policies are added on `storage.objects`, so the anon/authenticated keys cannot insert, update or delete. Public **read** works because the bucket is public.

### File layout
```
product-images/
└── products/{productId}/{random-uuid}.{jpg|png|webp}
```
The uploader's original filename is **never used** — a random UUID cannot contain `../`, spaces or other problem characters. Files are uploaded with `upsert: false` (never overwrite) and `cacheControl: 31536000` (names are never reused, so a 1-year cache is safe).

### SDK calls used (`apps/api/src/storage/supabase-image-storage.ts`)

| Purpose | Call |
|---|---|
| Upload | `storage.from(bucket).upload(path, buffer, { contentType, upsert: false, cacheControl })` |
| Delete | `storage.from(bucket).remove([path, …])` |
| Public URL | `storage.from(bucket).getPublicUrl(path).data.publicUrl` |
| Setup only | `storage.getBucket(id)`, `storage.createBucket(id, { public, fileSizeLimit, allowedMimeTypes })`, `storage.updateBucket(id, …)` |

All calls return `{ data, error }` rather than throwing; the adapter checks `error` and turns upload failures into **502 Bad Gateway** ("Image storage is unavailable").

### What the API does before uploading
1. **Type from content, not name:** the first bytes must be a JPEG, PNG or WebP signature. A script renamed `photo.jpg` is rejected with **415**.
2. **Size:** Multer stops reading at 5 MB → **413**.
3. **Re-encode with `sharp`:** applies the photo's orientation, shrinks anything over 2400 px, and **drops all metadata, including GPS location**. Undecodable files → **400**.
4. **Compensation:** if saving the database row fails after the upload, the file is deleted again.

### Testing
API tests never touch real Supabase: `test/utils/app.ts` swaps the storage adapter (`IMAGE_STORAGE`) for an in-memory one. The only code that talks to the real project is `pnpm storage:setup`.

---

## Auth — customer accounts (Phase 4 step 22)

**Code:** `apps/api/src/auth/` (adapter: `supabase-auth-provider.ts`). Storefront: `/login`, `/register`,
`/forgot-password`, `/reset-password`, `/account`. **Checked against the official docs:** October 2026.

### How it works
- The shop never talks to Supabase Auth directly: it calls our API (`/api/v1/auth/*`), and the API keeps
  the session in **HttpOnly, SameSite=Strict cookies** `nw_access` (≈1 h) and `nw_refresh` (30 days) —
  JavaScript can't read them (CLAUDE.md §8/§11). Production: `COOKIE_DOMAIN=.nowoll.com` so `nowoll.com`
  and `api.nowoll.com` share them; `Secure` in production.
- Every signed-in request: `getClaims(accessToken)` verifies the token's **signature** (JWKS, cached).
  Expired → `refreshSession({ refresh_token })` and new cookies on that response (refresh tokens rotate:
  an old one stops working). Banned / deleted accounts (`users.status`, `deleted_at`) are refused.
- `users.id` = the Supabase Auth user id. A missing `users` row is created on the next signed-in request.

### Supabase calls used (official JS reference)
| Our method | Supabase call | Client |
|---|---|---|
| createUser | `auth.admin.createUser({ email, password, email_confirm: true, user_metadata })` | service role |
| signIn | `auth.signInWithPassword({ email, password })` — `invalid_credentials` doesn't say which part was wrong | anon |
| refresh | `auth.refreshSession({ refresh_token })` | anon |
| verifyAccessToken | `auth.getClaims(jwt)` — verifies via `/.well-known/jwks.json` (asymmetric keys) | anon |
| signOut | `auth.admin.signOut(jwt, 'local')` — ends this session only | service role |
| sendPasswordReset | `auth.resetPasswordForEmail(email, { redirectTo })` | anon |
| verifyPasswordReset | `auth.verifyOtp({ type: 'recovery', token_hash })` | anon |
| setPassword | `auth.admin.updateUserById(id, { password })` | service role |

Both clients are stateless (`persistSession: false`). The service role key stays on the server.
`admin.createUser` is used for sign-up so it works the same whatever "Confirm email" is set to.

### Decisions (step 22)
- **No email confirmation at launch** — Supabase's built-in email only reaches members of the Supabase
  organization (2/hour). So "My orders" lists only orders placed **while signed in**, never guest orders
  that merely share the email.
- **Passwords:** 8–72 characters (`@nowoll/validation` — bcrypt ignores bytes after 72).
- **Rate limits:** 5/min on register, login, forgot and reset password; `/me` 60/min, `/logout` 30/min.
- **No account enumeration:** one answer for wrong email or wrong password; forgot-password always says "sent".

### Dashboard setup (Rafi)
1. **Authentication → URL Configuration → Redirect URLs:** add `http://localhost:3000/reset-password`
   (and at launch `https://nowoll.com/reset-password`).
2. **Authentication → Email Templates → Reset Password:** replace the link with
   ```html
   <a href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=recovery">Choose a new password</a>
   ```
   (`{{ .RedirectTo }}` = the `redirectTo` our API passes; `{{ .TokenHash }}` is meant for building your own link.)
3. **Custom SMTP (Resend)** — exact settings in [resend.md](./resend.md) → "Supabase password-reset emails
   through Resend". Until then reset emails reach only your Supabase organization's members. The branded
   reset-email HTML is [supabase-reset-password.html](./supabase-reset-password.html) (replaces step 2's one-line link).

Not yet: Google sign-in (later step).

### Real-project check (6 Oct 2026)
One test account against the real Supabase project, then deleted (Supabase + dev DB):
login sets HttpOnly cookies · wrong password and unknown email get the same answer · re-register →
`EMAIL_TAKEN` · `/me` · renewal with only the refresh cookie (both cookies rotated) · after sign-out the
refresh token no longer renews · forgot-password answers the same for any address (Supabase rejects
`example.com` addresses, logged only). Found: a sign-up whose `users` row failed to save (local DB was
down) was rebuilt **without the name** → the name now comes from `user_metadata.full_name`.

## Admin sign-in and 2FA (step 29a)

Staff sign in at the admin panel with the **same Supabase account** as the shop, through our API
(`/api/v1/admin/auth/*`), in two steps: password, then a 6-digit code from an authenticator app (TOTP).
The admin session lives in its **own** cookies, `nw_admin_access` / `nw_admin_refresh` (same flags as the
shop's) — the shop session never opens the admin panel, and signing out of one leaves the other.

**Every admin request** (`AdminGuard`) needs all of:
- a valid admin token (signature checked with `getClaims`, renewed if expired);
- `users.role` = `ADMIN` or `STAFF`, read from **our database** each request — so revoking or banning
  works on the very next click. (Chosen over a Supabase "custom access token hook": nothing to configure,
  and no stale role inside a token that lives an hour.);
- not banned or soft-deleted;
- the token's `aal` claim = `aal2` (code entered). A password-only (`aal1`) session can only set up
  the app or enter a code.

### Supabase calls used (checked against the installed SDK types and the official docs)
| Our method | Supabase call | Client |
|---|---|---|
| hasVerifiedTotp | `auth.admin.mfa.listFactors({ userId })` | service role |
| enrollTotp | `auth.mfa.enroll({ factorType: 'totp', friendlyName, issuer: 'Nowoll' })` → `totp.qr_code` (SVG data URL), `totp.secret` | as the user |
| verifyTotp | `auth.mfa.challengeAndVerify({ factorId, code })` → a new session at `aal2` | as the user |
| removeTotp | `auth.admin.mfa.deleteFactor({ id, userId })` — "logs the user out of all active sessions if the deleted factor was verified" | service role |
| (guard) | `aal` claim from `getClaims` — "This assurance level is encoded in the `aal` claim in the JWT" | anon |

"As the user" = a throw-away stateless client per call, `auth.setSession({ access_token, refresh_token })`
first (the MFA calls act on the client's current session). Half-finished set-ups (`unverified` factors) are
deleted before a new QR code is made. Official docs facts relied on: "TOTP MFA API is free to use and is
enabled on all Supabase projects by default"; after verifying a new factor "all other sessions are logged out"
(SDK docs) — so the first set-up signs that person out of other devices.

**Rules:** an already set-up app can't be replaced with just the password (a stolen password must not beat
2FA) — that takes `pnpm admin:reset-2fa`. 5 tries/min on login, enrol and verify per IP.

### Who is staff — Admin → Staff (step 38e)
The usual way: an **Admin** opens **Admin → Staff** and adds the email of an existing shop account
(the person signs up on the shop first, choosing their own password), as **Staff** or **Admin**;
changes a role; removes access (back to a customer account); or resets someone's authenticator app
(`removeTotp` above). Every change is written to the `staff_changes` log. Rules (the API enforces them):
- only an Admin can manage staff; nobody can change, remove or reset **their own** access;
- there is always at least one Admin (checked in a SERIALIZABLE transaction, so two admins removing
  each other at the same moment can't leave none);
- banned or deleted accounts can't be added; 2FA can never be switched off.

**What Staff may do** (`@AdminOnly({ role: 'ADMIN' })` routes refuse them with `403 ADMIN_ONLY`):
Staff — orders, products, categories, inventory, customers, returns (not refunds), content, pages,
reviews, dashboard. Admin only — refunds, discount codes, settings (incl. payments, look), shipping,
staff. The role is read from our database on every request, so a change applies on the next click.

### Who is staff — commands (repo root)
For when no Admin can sign in (they write to the same change log, as "a server command"):
```bash
pnpm admin:grant you@example.com          # ADMIN (or add STAFF)
pnpm admin:revoke someone@example.com     # back to a customer account
pnpm admin:reset-2fa you@example.com      # lost phone — see below
```
The account must exist first: sign up on the shop with that email. In production these run on the server
with the production `.env` — never edit `users.role` by hand.

### Lost phone
1. Someone with server access runs `pnpm admin:reset-2fa <email>` — the old app is removed and that person
   is signed out everywhere.
2. They sign in again: password → a new QR code → scan it with the new phone.

If NO admin can sign in, the same command is the way back in (it needs only server access, not the panel).
Tip: when scanning, also save the set-up key (shown under "Can't scan it?") in a password manager.

### Testing
API tests use `apps/api/test/utils/fake-auth-provider.ts` (tokens expire, refresh tokens are single-use,
reset links work once; each authenticator app's code is fixed — `codeOnPhone(userId)`) — no test creates a
real account. Admin sign-in: `apps/api/test/admin-auth.e2e-spec.ts`; helper `test/utils/admin.ts`.

## Production database connection (step 47)

Checked against the official guide "Connect to your database" (supabase.com/docs/guides/database/connecting-to-postgres, 14 Oct 2026):

| Type | Host | Port | Network |
|---|---|---|---|
| Direct connection | `db.[PROJECT-REF].supabase.co` | 5432 | **IPv6 only** (IPv4 needs the paid add-on) |
| **Session pooler** | `aws-[INDEX]-[REGION].pooler.supabase.com` (copy it — `[INDEX]` can't be guessed) | 5432 | IPv4 on every plan |
| Transaction pooler | same pooler host | 6543 | IPv4 — **no prepared statements** (Prisma would need `pgbouncer=true`) |

Pooled connections use the user name `postgres.[PROJECT-REF]`; direct ones use `postgres`.

**We use the Session pooler string for both:**
- `PROD_DATABASE_URL` (GitHub secret) — CI runs `prisma migrate deploy`; GitHub's machines have no IPv6.
- `DATABASE_URL` in `/opt/nowoll/.env` — the API and workers run in Docker, whose network is IPv4 by default.

Where: Supabase dashboard → **Connect** → "Session pooler" → copy the URI and put in the database password.

**Which project is which (decided 16 Oct 2026):**
- **Staging:** the existing project (region **Singapore**). It already holds test data, and staging doesn't need
  to be close to the server.
- **Production:** a **new** project in **Mumbai** (`ap-south-1`), next to the VPS in India. Every page asks the
  database several times, so the server and the database must be in the same region. It starts on the free
  plan during the trial month. **Upgrade it to Pro ($25/month) before the ads start**, for daily backups and
  no pausing.

---

*Claude Code: read this file before any Supabase-related change. If the official Supabase docs disagree with it, update this file and tell Rafi.*
