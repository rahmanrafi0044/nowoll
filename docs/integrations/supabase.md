# Supabase Integration Contract

## Overview
Nowoll uses Supabase for three things:

| Feature | Used by | Status |
|---|---|---|
| **PostgreSQL** (hosted database) | API via Prisma | Local Docker Postgres in dev; Supabase in production (Phase 7) |
| **Storage** (product images) | API only | ✅ Implemented — Phase 2 step 10 |
| **Auth** (login, 2FA) | storefront, admin, API | Phase 4 — admin proxy already verifies tokens with `getClaims()` |

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

## Auth — Phase 4 (not implemented yet)

Decided so far:
- Sign-in via Supabase Auth; `users.id` = the Supabase Auth user id.
- Admin access requires `user_role ∈ {ADMIN, STAFF}` **and** `aal = 'aal2'` (2FA) in the access token.
- `user_role` will be added to tokens by a Supabase **custom access token hook**. TODO(phase 4): confirm the hook's exact input/output format against Supabase's documentation before writing it — do not guess.

---

*Claude Code: read this file before any Supabase-related change. If the official Supabase docs disagree with it, update this file and tell Rafi.*
