# Speed audit — Lighthouse (step 51, October 2026)

Goal (spec step 51): **Lighthouse mobile score ≥ 90** on the homepage, the product listings and a product page.
Lighthouse is Google's page-speed test. In mobile mode it pretends to be a mid-range phone on slow 4G — close to
an ad visitor in Bangladesh.

**Result: 95–98 on all four pages (quiet PC). Two problems found and fixed.** The final word comes from the VPS
(step 49), see "Measuring again" below.

## How it was measured

`pnpm lighthouse` (`tests/e2e/run-lighthouse.ts`) starts the real production shop and API on this PC with a
**launch-sized catalogue**: 100 products in 4 categories, each with photos the weight of real phone photos
(1200×1500), and a homepage hero photo. Each page is first visited once (so photos are already resized, as for
most real visitors), then measured 3 times; the middle score counts.

| Page | Before | After | Main content shown | Phone frozen by scripts | Download |
|---|---|---|---|---|---|
| Homepage | 92 | **95** | 3.1 s → 2.5 s | 172 → 189 ms | 376 → 317 KB |
| Shop (all products) | 67 | **97** | 3.6 s → 1.6 s | 1095 → 199 ms | 393 → 332 KB |
| Category (25 products) | 66 | **97** | 3.4 s → 2.3 s | 1452 → 103 ms | 389 → 330 KB |
| Product | 77 | **98** | 1.3 s → 2.4 s | 1119 → 36 ms | 319 → 256 KB |

Both columns were measured with the same tool and catalogue, on the PC at the same speed (Lighthouse's PC-speed
number 2000–2400). Layout shift was 0 everywhere, before and after. "Main content" on the product page is the
product photo; on the other pages it is the cookie-banner text (see fix 1).

## What was fixed

1. **The cookie banner appeared only after all the JavaScript had run** (1–3 s on a phone). It is what a
   first-time visitor sees first, so Lighthouse counted the whole page as that slow. Now it is **in the page's
   HTML** and shows at once. For a returning visitor, a tiny script runs before the first paint, reads their saved
   choice and hides it — no flash (`consentCheckScript` in `@nowoll/analytics`; tests: unit, plus browser tests
   that block all JavaScript to prove both cases). Pages stay pre-built.
2. **Every page loaded the whole form-checking library (Zod) with all its languages** — 409 KB of JavaScript,
   German, Japanese, Esperanto… The package is now marked as safe to trim (`sideEffects` in
   `packages/validation/package.json`) and imports Zod the way its docs recommend, so only the checks a page uses
   are sent: **−61 KB compressed JavaScript (−18%)**. Every schema file imports the no-eval switch first
   (`jitless.ts`, security audit) — the shop's CSP browser test caught it when the build stopped loading `index.ts`.

## Checked and fine

- **Fonts**: served by the shop itself, only the one chosen in Admin → Settings is downloaded.
- **Images**: `next/image` resizes and compresses; the product page's main photo loads first.
- **Layout shift**: 0 on every page.
- **Link prefetching**: on a listing, Next.js loads the product pages on screen in the background (13–21 small
  requests, 33–41 KB) so a tap opens them instantly. Kept on purpose: an instant first tap keeps customers.
  If the VPS measurement shows the phone frozen by it, `prefetch={false}` on the product cards is the switch.
- **Listings (`/shop`, categories)** are built per visitor because of the filters in the address. The data is
  cached for 60 s: the first visitor of a filter pays 0.3–0.6 s on the server, everyone after ~0.05 s. To be
  checked under load in step 49.

## After the design refresh (38f, 23 Oct 2026)

Same tool and launch catalogue, now with the new design (women's stand-in catalogue, hero slides, new homepage
sections, 2–4 photos per card). PC speed 2172–2797.

| Page | Score | Main content | Frozen | Download |
|---|---|---|---|---|
| Homepage | **96** | 2.6 s | 68 ms | 385 KB |
| Shop (all products) | **95** | 2.9 s | 42 ms | 455 KB |
| Category | **98** | 2.2 s | 65 ms | 454 KB |
| Product | **98** | 2.4 s | 59 ms | 356 KB |

**One problem found and fixed:** the product page first scored 87 — its main photo faded in from invisible
(the new soft fade), and a photo at opacity 0 doesn't count as shown, so "main content" took 3.9 s. Now the
first photo appears at once (the fade only plays when switching photos) and is marked `fetchPriority="high"`
(Next.js 16 replaced `priority` with `preload` / `loading` + `fetchPriority`). A run on a busy PC (speed 1494–1818,
under the 1800 warning) scored 85–91 on every page; the quiet re-run above is the one that counts.

## Measuring again

```bash
pnpm lighthouse                                   # this PC: production build + launch catalogue (~10 min)
pnpm lighthouse -- --skip-build                   # reuse the last build
pnpm lighthouse -- --url https://nowoll.com --auth user:password   # a running site (e.g. the trial)
```

Full reports (open in a browser): `tests/e2e/lighthouse-report/`.

**This PC is a noisy place to measure.** With 5 GB for WSL, the shop, the API, Chrome and the trial site make it
swap; the same code then scored anywhere from 66 to 97. The tool prints Lighthouse's PC-speed number and **warns
when it is below 1800** — then close programs, stop the trial (`infrastructure/preview/preview.sh down`) and run
again. The trustworthy numbers come from steady machines:

- **Step 49 (VPS):** run `pnpm lighthouse -- --url https://nowoll.com` and **Google PageSpeed Insights**
  (pagespeed.web.dev — Google's own machines) once the password is off, before the ads start.
- **After the design refresh (38f):** run it again — the new design changes these same pages.
