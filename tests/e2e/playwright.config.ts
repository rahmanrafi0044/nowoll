import { defineConfig, devices } from '@playwright/test'
import { SHOP_URL } from './support/env.js'

// Started by run-e2e.ts (pnpm test:e2e), which brings the apps up first.
export default defineConfig({
  testDir: './specs',
  // One test at a time: the real API + storefront + a browser already use a
  // good part of a 4 GB machine — and tests share one database.
  workers: 1,
  fullyParallel: false,
  retries: 0, // a flaky browser test is a bug to fix, not to retry away
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: {
    baseURL: SHOP_URL,
    trace: 'retain-on-failure', // a step-by-step recording of any failing test
    screenshot: 'only-on-failure',
  },
  projects: [
    // Most Nowoll customers shop on their phone: the full purchase runs there too.
    { name: 'phone', use: { ...devices['Pixel 7'] }, grep: /@phone/ },
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
  ],
})
