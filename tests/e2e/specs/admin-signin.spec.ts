// Step 50 — signing in to the admin panel: password + 2FA (TOTP), as in
// production (CLAUDE.md §11.8). The e2e API's sign-in is a pretend Supabase
// (apps/api/test/e2e-server.ts); the role and 2FA checks are the real API's.
import { ADMIN_URL } from '../support/env.js'
import { ADMIN, SHOPPER } from '../support/fixtures.js'
import { codeFor, enterAdminPassword } from '../support/flows.js'
import { expect, test } from '../support/test.js'

// In order: the first test sets up the admin's authenticator app, the second uses it.
test.describe.configure({ mode: 'serial' })
let setupKey = ''

test('first sign-in sets up 2FA: a wrong code is refused, the right one opens the dashboard', async ({
  page,
}) => {
  await enterAdminPassword(page, ADMIN)
  await expect(
    page.getByRole('heading', { name: 'Set up two-factor authentication' }),
  ).toBeVisible()
  await expect(page.getByRole('img', { name: 'QR code for your authenticator app' })).toBeVisible()
  await page.getByText('Can’t scan it?').click()
  setupKey = (await page.locator('details code').textContent())?.trim() ?? ''
  expect(setupKey).not.toBe('')

  const right = codeFor(setupKey)
  const wrong = right === '000000' ? '111111' : '000000'
  await page.getByLabel('6-digit code').fill(wrong)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/admin\/login/)

  await page.getByLabel('6-digit code').fill(right)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/admin\/dashboard/)
})

test('a password alone opens nothing — the 2FA code is required', async ({ page }) => {
  await enterAdminPassword(page, ADMIN)
  await expect(page.getByLabel('6-digit code')).toBeVisible()
  // Skip the code and go straight to a page: the API refuses the half-signed-in
  // session (password only), and the panel sends us back to sign in.
  await page.goto(`${ADMIN_URL}/admin/orders`)
  await expect(page).toHaveURL(/\/admin\/login/)
})

test('the next sign-in asks only for the code — no new QR code', async ({ page }) => {
  await enterAdminPassword(page, ADMIN)
  await expect(page.getByLabel('6-digit code')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Set up two-factor authentication' })).toHaveCount(
    0,
  )
  await page.getByLabel('6-digit code').fill(codeFor(setupKey))
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/admin\/dashboard/)
})

test('a shop account cannot get into the admin panel', async ({ page }) => {
  await enterAdminPassword(page, SHOPPER)
  // Wait for the API's answer itself — checking only that the code field is
  // absent would pass before the answer even arrives.
  await expect(page.getByText('This account doesn’t have admin access.')).toBeVisible()
  await expect(page.getByLabel('6-digit code')).toHaveCount(0)
  await expect(page).toHaveURL(/\/admin\/login/)
  // And nothing behind the sign-in page opens without a session.
  await page.goto(`${ADMIN_URL}/admin/orders`)
  await expect(page).toHaveURL(/\/admin\/login/)
})
