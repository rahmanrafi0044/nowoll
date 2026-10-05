# Browser tests (Playwright)

Real Chromium clicking through the **real** storefront and API, the way a customer does.

```bash
pnpm test:e2e                                   # everything (from the repo root)
pnpm --filter @nowoll/e2e test:e2e -- --project=phone          # phone screen only
pnpm --filter @nowoll/e2e test:e2e -- specs/tracking.spec.ts   # one file
E2E_SKIP_BUILD=1 pnpm --filter @nowoll/e2e test:e2e            # reuse the last storefront build
pnpm --filter @nowoll/e2e report                # open the last HTML report (with traces of failures)
```

Needs Docker running (`docker compose up -d`). **One-time setup** on a new computer:

```bash
pnpm --filter @nowoll/e2e exec playwright install chromium        # the browser (~115 MB)
sudo pnpm --filter @nowoll/e2e exec playwright install-deps chromium   # system libraries (Linux/WSL)
```

## What happens (`run-e2e.ts`)

1. The **`nowoll_e2e`** database is created if needed, migrated, wiped, and seeded: the standard
   settings and delivery zones plus a fixed catalogue (`support/fixtures.ts`). Your `nowoll_dev`
   and `nowoll_test` databases are never touched.
2. The API's production build starts on **:3101** — no SSLCommerz credentials, so "Pay online" is
   "not set up".
3. The storefront is built **while the API runs** (so the homepage and product pages are built from
   real data) into `.next-e2e`, never replacing your normal build, and starts on **:3100**.
4. Playwright runs the tests one at a time; both servers are stopped afterwards, even after a failure.

Different ports and database from `pnpm dev`, so both can run at the same time.

## What's covered

| Test | Flow |
|---|---|
| `purchase` (phone **and** desktop) | homepage → category → product → size → bag → checkout → cash on delivery → confirmation; order saved, stock reserved; "Back" finds an empty bag |
| `discount` | code applied in the bag → total on review → shown on the confirmation, use counted |
| `tracking` | footer → Track your order with number + mobile → progress shown, no street address; wrong email → "couldn't find" |
| `stock` | sold-out size can't be chosen; stock gone between review and "Place order" → refused, nothing taken, back to the bag |
| `online-payment` | "Pay online" while SSLCommerz isn't set up → "Choose another way to pay" → cash on delivery works |

Each test acts as a different visitor (its own `X-Forwarded-For`, see `support/test.ts`), so the
API's real rate limits stay on.

## Not covered yet

- **Real SSLCommerz payment pages** — needs sandbox credentials and a public tunnel; tested by hand
  (`docs/integrations/sslcommerz.md`). The rules are covered by the API's tests.
- **Admin flows** (create product → on the storefront, mark shipped → email) — added with admin
  login (Phase 4/5).
- **Running in GitHub Actions** — a later CI step.
