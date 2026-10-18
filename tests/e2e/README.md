# Browser tests (Playwright)

Real Chromium clicking through the **real** storefront, admin panel and API, the way a customer and the
shop owner do.

```bash
pnpm test:e2e                                   # everything (from the repo root)
pnpm --filter @nowoll/e2e test:e2e -- --project=phone          # phone screen only
pnpm --filter @nowoll/e2e test:e2e -- specs/tracking.spec.ts   # one file
E2E_SKIP_BUILD=1 pnpm --filter @nowoll/e2e test:e2e            # reuse the last storefront + admin builds
pnpm --filter @nowoll/e2e report                # open the last HTML report (with traces of failures)
```

Needs Docker running (`docker compose up -d`: Postgres, Redis and Mailpit). Don't run builds, type checks or
other tests at the same time: on a small PC that runs out of memory. **One-time setup** on a new computer:

```bash
pnpm --filter @nowoll/e2e exec playwright install chromium        # the browser (~115 MB)
sudo pnpm --filter @nowoll/e2e exec playwright install-deps chromium   # system libraries (Linux/WSL)
```

## What happens (`run-e2e.ts`)

1. The **`nowoll_e2e`** database is created if needed, migrated, wiped, and seeded: the standard
   settings and delivery zones plus a fixed catalogue (`support/fixtures.ts`). Your `nowoll_dev`
   and `nowoll_test` databases are never touched.
2. The API's production build starts on **:3101** through `apps/api/test/e2e-server.ts`, with two
   things swapped (test-only; never in a build or an image):
   - **sign-in** → a pretend Supabase (`FakeAuthProvider`). Admin accounts (`support/fixtures.ts`) start
     without an authenticator app; the first sign-in shows the set-up key, and the code is its last 6
     characters (`support/flows.ts` → `codeFor`);
   - **photos** → kept in memory, with addresses on `e2e-images.invalid`, a domain that never exists. So
     the shop and admin log `ENOTFOUND e2e-images.invalid` when they try to show a test photo. **That's
     expected**, not a failure.

   No SSLCommerz credentials either, so "Pay online" is "not set up".
3. The **notification worker** starts and sends its emails to **Mailpit** (`localhost:1025`; tests read
   them through its API on `:8025`).
4. The storefront is built **while the API runs** (so the homepage and product pages are built from
   real data) into `.next-e2e`, never replacing your normal build, and starts on **:3100**. The admin
   panel is built the same way and starts on **:3102**.
5. Playwright runs the tests one at a time; every server is stopped afterwards, even after a failure.

Different ports and database from `pnpm dev`, so both can run at the same time.

## What's covered

| Test | Flow |
|---|---|
| `purchase` (phone **and** desktop) | homepage → category → product → size → bag → checkout → cash on delivery → confirmation; order saved, stock reserved; "Back" finds an empty bag |
| `discount` | code applied in the bag → total on review → shown on the confirmation, use counted |
| `tracking` | footer → Track your order with number + mobile → progress shown, no street address; wrong email → "couldn't find" |
| `stock` | sold-out size can't be chosen; stock gone between review and "Place order" → refused, nothing taken, back to the bag |
| `online-payment` | "Pay online" while SSLCommerz isn't set up → "Choose another way to pay" → cash on delivery works |
| `admin-signin` | first sign-in sets up 2FA (QR + key), a wrong code is refused; a password alone opens nothing; the next sign-in asks only for the code; a shop account is refused |
| `admin-product` | create a product (name, category, price, a size with stock, a photo) → publish → it's on the shop with its price and size |
| `admin-order` | a guest's cash-on-delivery order → the admin confirms it and marks it shipped (courier + tracking) → the customer's "is on its way" email arrives in Mailpit |

Each test acts as a different visitor (its own `X-Forwarded-For`, see `support/test.ts`), so the
API's real rate limits stay on.

## Not covered yet

- **Real SSLCommerz payment pages** — needs sandbox credentials and a public tunnel; tested by hand
  (`docs/integrations/sslcommerz.md`). The rules are covered by the API's tests.
- **Real Supabase sign-in and Storage** — the tests use the pretend ones above; the real ones were checked
  by hand against the dev project (`docs/integrations/supabase.md`).
