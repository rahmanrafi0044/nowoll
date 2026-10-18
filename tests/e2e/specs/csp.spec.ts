// Security audit (step 53, docs/security-audit.md) — the shop's
// Content-Security-Policy (apps/storefront/src/lib/csp.ts) is sent on every
// page, and the shop itself never trips it: not while browsing and buying, and
// not when "Accept all" loads Google's and Meta's scripts. Violations are read
// from the browser's own `securitypolicyviolation` events.
import type { Page } from '@playwright/test'
import { BLOG_POST, CATEGORY, SHIRT } from '../support/fixtures.js'
import { buyShirtCashOnDelivery } from '../support/flows.js'
import { expect, test } from '../support/test.js'

/** Starts collecting every CSP violation the browser reports, on every page. */
async function collectViolations(page: Page): Promise<() => Promise<string[]>> {
  // Runs inside the page (this project has no DOM types, hence the shapes below).
  await page.addInitScript(() => {
    const seen: string[] = []
    const g = globalThis as unknown as {
      __csp: string[]
      document: {
        addEventListener(
          type: 'securitypolicyviolation',
          listener: (e: {
            violatedDirective: string
            blockedURI: string
            sourceFile: string
            lineNumber: number
            columnNumber: number
          }) => void,
        ): void
      }
    }
    g.__csp = seen
    g.document.addEventListener('securitypolicyviolation', (e) =>
      seen.push(
        `${e.violatedDirective} ← ${e.blockedURI} (${e.sourceFile}:${e.lineNumber}:${e.columnNumber})`,
      ),
    )
  })
  // Each page load starts a fresh list in the page; this keeps them all.
  const all: string[] = []
  return async () => {
    const now = await page.evaluate(() => (globalThis as unknown as { __csp: string[] }).__csp)
    all.push(...now)
    return all
  }
}

test('every page carries the CSP, and browsing + buying never violates it', async ({ page }) => {
  const violations = await collectViolations(page)
  const pages = [
    '/',
    `/shop/${CATEGORY.slug}`,
    `/products/${SHIRT.slug}`,
    '/blog',
    `/blog/${BLOG_POST.slug}`,
    '/orders/track',
  ]
  for (const path of pages) {
    const res = await page.goto(path)
    const csp = res?.headers()['content-security-policy'] ?? ''
    expect(csp, path).toContain("frame-ancestors 'none'")
    expect(csp, path).toContain("object-src 'none'")
    await page.waitForLoadState('networkidle')
    expect(await violations(), path).toEqual([])
  }
  // The whole purchase, up to the confirmation page.
  await buyShirtCashOnDelivery(page)
  await page.waitForLoadState('networkidle')
  expect(await violations()).toEqual([])
})

test.describe('with cookie consent', () => {
  test.use({ consentChosen: false })

  test('"Accept all" loads Google’s and Meta’s scripts without any CSP violation', async ({
    page,
  }) => {
    const violations = await collectViolations(page)
    // Let the real scripts through this time (support/test.ts blocks them by default)
    // and answer them with an empty script, so nothing reaches Google or Meta.
    await page.unrouteAll({ behavior: 'ignoreErrors' })
    await page.route(/googletagmanager\.com|connect\.facebook\.net/, (route) =>
      route.fulfill({ status: 200, contentType: 'text/javascript', body: '/* stub */' }),
    )
    const loaded: string[] = []
    page.on('requestfinished', (r) => {
      if (/googletagmanager\.com|connect\.facebook\.net/.test(r.url())) loaded.push(r.url())
    })
    await page.goto(`/products/${SHIRT.slug}`)
    await page
      .getByRole('region', { name: 'Cookies' })
      .getByRole('button', { name: 'Accept all' })
      .click()
    await expect.poll(() => loaded.length).toBeGreaterThanOrEqual(2) // gtag.js + fbevents.js
    expect(await violations()).toEqual([])
  })
})
