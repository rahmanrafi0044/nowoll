import { test as base, expect } from '@playwright/test'

// RATE LIMITS vs. TESTS: the API allows e.g. 5 order look-ups and 10 orders
// per minute per visitor, and every test comes from the same computer. The
// API trusts one proxy hop (Nginx in production), so a different
// X-Forwarded-For header per test makes each test a "different visitor" —
// the real limits stay on and nothing in the app changes for testing.
export const test = base.extend({
  page: async ({ page }, use) => {
    const n = () => Math.floor(Math.random() * 250) + 1
    await page.setExtraHTTPHeaders({ 'x-forwarded-for': `10.${n()}.${n()}.${n()}` })
    await use(page)
  },
})

export { expect }

// Note for writing tests: Next.js keeps an invisible role="alert" element that
// announces page changes to screen readers — always find OUR alert by its text:
//   page.getByRole('alert').filter({ hasText: '…' })
