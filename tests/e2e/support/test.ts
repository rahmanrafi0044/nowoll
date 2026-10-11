import { CONSENT_STORAGE_KEY, ONLY_NECESSARY, serializeConsent } from '@nowoll/analytics'
import { test as base, expect } from '@playwright/test'

/** Google's and Meta's script and data addresses — never reached from a test. */
export const TRACKING_HOSTS =
  /^https:\/\/(www\.googletagmanager\.com|[\w.-]*google-analytics\.com|connect\.facebook\.net|www\.facebook\.com)\//

// RATE LIMITS vs. TESTS: the API allows e.g. 5 order look-ups and 10 orders
// per minute per visitor, and every test comes from the same computer. The
// API trusts one proxy hop (Nginx in production), so a different
// X-Forwarded-For header per test makes each test a "different visitor" —
// the real limits stay on and nothing in the app changes for testing.
//
// COOKIE BANNER (step 39a): the e2e shop has tracking IDs, so the banner would
// sit over the page. Tests start as a customer who already chose "Only
// necessary" — except those that set `consentChosen: false` to test the banner.
export const test = base.extend<{ consentChosen: boolean }>({
  consentChosen: [true, { option: true }],
  page: async ({ page, consentChosen }, use) => {
    const n = () => Math.floor(Math.random() * 250) + 1
    await page.setExtraHTTPHeaders({ 'x-forwarded-for': `10.${n()}.${n()}.${n()}` })
    await page.route(TRACKING_HOSTS, (route) => route.abort())
    if (consentChosen)
      await page.addInitScript(
        ([key, value]) => localStorage.setItem(key!, value!),
        [CONSENT_STORAGE_KEY, serializeConsent(ONLY_NECESSARY, new Date())],
      )
    await use(page)
  },
})

export { expect }

// Note for writing tests: Next.js keeps an invisible role="alert" element that
// announces page changes to screen readers — always find OUR alert by its text:
//   page.getByRole('alert').filter({ hasText: '…' })
