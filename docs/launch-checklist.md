# Launch checklist — status and how each item is proven (step 54)

The spec's launch checklist (`docs/00-master-spec.md` → Launch Checklist) with, for every item: **where it stands,
how it is proven, and who does it.** Run through it again on the VPS, right before the ads start.

**Two commands do most of the checking:**

```bash
pnpm launch-check -- --url https://nowoll.com            # the live site, from outside (only reads)
# while the trial password is on:  … --auth user:password
```
GitHub → Actions → **Database tasks** → environment `production`, task **`launch-check`** → the database (only
reads). Both print ✅ / ❌ per item and what to do.

| | Meaning |
|---|---|
| ✅ | proven now — by the test or command named |
| ⏳ | needs the VPS (step 49) — then run the commands above |
| 🔑 | needs Rafi (an account, a setting) |
| 🧑‍💼 | needs the owner (shop content) |

## Status on 20 Oct 2026

Measured against the trial site (`pnpm launch-check -- --url https://nowoll.com`) and the local database.

### DNS & SSL
| Item | Status | Proof / what to do |
|---|---|---|
| DNS at Cloudflare: `nowoll.com`, `www`, `admin`, `api` → server | ✅ trial / ⏳ VPS | launch-check "answers over HTTPS". Today they reach the trial on Rafi's PC; step 49 moves them to the VPS |
| The three `staging` names | ⏳ | launch-check: not created yet (ENOTFOUND) — step 49 |
| SSL active for all (Certbot `--cert-name nowoll`), Cloudflare "Full (strict)" | ⏳ | launch-check proves HTTPS works; Full (strict) is a Cloudflare setting — 🔑 docs/integrations/cloudflare.md |
| HTTPS everywhere (no HTTP) | ⏳ | launch-check "plain http:// is sent to https://" + "HSTS" (Nginx on the VPS does both) |
| Trial password OFF before the ads | 🔑 | launch-check "trial password OFF" — fails until `SITE_PASSWORD=off`, on purpose |

### Environment variables
| Item | Status | Proof / what to do |
|---|---|---|
| GitHub repository variables set | ⏳ 🔑 | docs/deployment.md → "GitHub settings"; the deploy workflow refuses to run without them |
| All production env vars in `.env` on the VPS | ⏳ 🔑 | the API refuses to start with a missing/invalid one (env validation) — so a healthy launch-check = set |
| No dev/sandbox keys in production | ⏳ 🔑 | launch-check "online payment is LIVE" (reads `/health` → `onlinePayment`); Supabase keys: production project only (docs/deployment.md) |

### Payments
| Item | Status | Proof / what to do |
|---|---|---|
| SSLCommerz live credentials (not sandbox) | 🔑 | launch-check "online payment is LIVE" — today the trial has none (cash on delivery only) |
| IPN URL registered: `https://api.nowoll.com/api/v1/payment/sslcommerz/ipn` | 🔑 | SSLCommerz merchant panel (docs/integrations/sslcommerz.md). Also confirm there the open TODO in `packages/payments/src/sslcommerz.adapter.ts` (`format=json` on the validation call) |
| Full SSLCommerz payment with a real BDT amount | 🔑 | by hand after the above: pay ৳10–50 with your own card/bKash, check the order turns "Paid", then refund it from Admin |
| COD end-to-end | ✅ | browser test `purchase.spec.ts` (guest, from the homepage, on a phone); CI on every PR |

### Database
| Item | Status | Proof / what to do |
|---|---|---|
| Migrations applied on production Supabase | ✅ local / ⏳ | Database tasks → launch-check "all database changes applied" |
| RLS on all tables | ✅ | Database tasks → launch-check: all 30 tables have RLS, with **no** policies on purpose (the browser key can read nothing; only the API's server key gets in — docs/integrations/supabase.md) |
| Bucket `product-images` with public read | ⏳ | Database tasks → launch-check (reads `storage.buckets`) |
| Daily backups (Supabase Pro) | 🔑 | Supabase dashboard → Database → Backups. Free plan: none — upgrade before launch, or download a backup weekly |

### Content
| Item | Status | Proof / what to do |
|---|---|---|
| All product photos with alt text | ✅ rule / 🧑‍💼 | the admin requires alt text; Database tasks → launch-check "every photo has alt text" + "every product has a photo". Good alt text: docs/accessibility.md |
| Privacy, Terms, Return policy final | 🧑‍💼 | launch-check: each page published, not the placeholder. Admin → Content → Pages |
| Contact details visible (address, email, phone) | 🧑‍💼 | **empty today** — launch-check "contact details set". Admin → Settings → Store |
| No placeholder / demo content | ⏳ | launch-check (sitemap) + Database tasks "no demo / test products" |
| Announcement bar set | 🧑‍💼 | launch-check (a warning if off — it's optional). Admin → Content → Announcement |

### Functionality
All proven by automatic tests on every PR (CI) — re-checked by hand once on the VPS (docs/deployment.md, 5-minute
click-through).

| Item | Status | Proof |
|---|---|---|
| Guest purchase, SSLCommerz: … → payment → email | ✅ code / 🔑 real | API tests with a pretend SSLCommerz (`payments.e2e-spec.ts`: a validated IPN confirms the payment, a forged `status=VALID` changes nothing); the real one: see Payments |
| Guest purchase, COD → email | ✅ | `purchase.spec.ts` + `admin-order.spec.ts` (the email arrives, Mailpit) |
| Registered: login → wishlist → checkout with saved address | ✅ partly | sign-in, wishlist and address book: API tests `account.e2e-spec.ts`; saving an address at checkout: `checkout.test.tsx`. **Choosing** a saved address at checkout has no test — check it by hand on the VPS |
| Discount code: apply, validate, remove | ✅ | `discount.spec.ts` + API tests |
| Order tracking without login | ✅ | `tracking.spec.ts` |
| Admin: add product → on the shop within 60 s | ✅ | `admin-product.spec.ts` |
| Admin: mark shipped → customer email with tracking link | ✅ | `admin-order.spec.ts` |
| Low-stock email at the threshold | ✅ | `workers/order-worker/src/handle-job.test.ts` + API stock tests |

### SEO & performance
| Item | Status | Proof / what to do |
|---|---|---|
| `/sitemap.xml` valid | ✅ / ⏳ | launch-check (valid, every address on nowoll.com, no demo pages) |
| Structured data passes Google's Rich Results Test | ✅ / 🔑 | launch-check finds Organization, Product, BreadcrumbList; then paste one product address into search.google.com/test/rich-results (needs the password off) |
| Lighthouse mobile ≥ 90 (home, listing, product) | ✅ | `pnpm lighthouse` 95–100 (docs/performance.md); again on the VPS with PageSpeed Insights |
| No horizontal scroll on mobile | ✅ | `accessibility.spec.ts` (320 px, 5 pages) |

### Monitoring
| Item | Status | Proof / what to do |
|---|---|---|
| Sentry receiving events | 🔑 | not built yet — its own small step once Rafi has a free Sentry account (docs/security-audit.md, finding 8) |
| UptimeRobot on `nowoll.com` and `api.nowoll.com` | ⏳ 🔑 | free account; monitor `https://nowoll.com` and `https://api.nowoll.com/api/v1/health` (it answers only when the database is reachable) |
| CI passing on main | ✅ | GitHub → Actions; every merge needs green CI |

## What's left, by who

- **Me (with you):** step 49 (VPS), Sentry step, the 38f design refresh.
- **You:** SSLCommerz live account + IPN address, Supabase Pro (backups), Sentry and UptimeRobot accounts,
  `SITE_PASSWORD=off` on launch day, Cloudflare "Full (strict)".
- **The owner:** contact details, the three policies, real products and photos (with alt text), announcement.
- **Launch day:** both launch checks all ✅ → a real ৳10 payment → start the ads.
