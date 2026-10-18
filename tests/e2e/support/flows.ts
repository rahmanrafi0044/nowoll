// The steps several tests share, written the way a customer does them:
// by visible labels and buttons, never by CSS classes or test ids.
import type { Page } from '@playwright/test'
import { expect } from './test.js'
import { ADMIN_URL } from './env.js'
import { CUSTOMER, SHIRT } from './fixtures.js'

/**
 * Taps a size on the product page. The radio button itself is hidden (only
 * screen readers use it); people tap its visible label — so do we.
 */
export async function chooseSize(page: Page, size: string) {
  const radio = page.getByRole('radio', { name: size, exact: true })
  await page.locator('label').filter({ has: radio }).click()
  await expect(radio).toBeChecked()
}

/**
 * The "Add to bag" button a customer would press. Phones show a second one in
 * a bar stuck to the bottom of the screen (desktops hide it) — that's the one
 * under the thumb, and the last on the page.
 */
export const addToBagButton = (page: Page, name = 'Add to bag') =>
  page.getByRole('button', { name }).last()

/** On the product page: pick a size, press "Add to bag" — the bag drawer opens. */
export async function addShirtToBag(page: Page, size: keyof typeof SHIRT.sizes = 'M') {
  await page.goto(`/products/${SHIRT.slug}`)
  await chooseSize(page, size)
  await addToBagButton(page).click()
  await expect(page.getByRole('dialog')).toBeVisible()
}

/** Fills contact → address → delivery → payment, up to the review step. */
export async function checkoutToReview(
  page: Page,
  payment: 'Cash on delivery' | 'Pay online',
  /** Checks to run on the payment step before choosing (e.g. an option greyed out). */
  options: { beforeChoosing?: () => Promise<void> } = {},
) {
  await expect(page.getByRole('heading', { name: 'Checkout' })).toBeVisible()
  await page.getByLabel('Full name').fill(CUSTOMER.fullName)
  await page.getByLabel('Email', { exact: true }).fill(CUSTOMER.email)
  await page.getByLabel('Mobile number').fill(CUSTOMER.phone)
  await page.getByRole('button', { name: 'Continue to address' }).click()

  await page
    .getByRole('combobox', { name: 'Division', exact: true })
    .selectOption(CUSTOMER.division)
  await page
    .getByRole('combobox', { name: 'District', exact: true })
    .selectOption(CUSTOMER.district)
  await page.getByLabel('Area / thana').fill(CUSTOMER.area)
  await page.getByRole('textbox', { name: /^Address$/ }).fill(CUSTOMER.address)
  await page.getByRole('button', { name: 'Continue to delivery' }).click()

  await page.getByRole('button', { name: 'Continue to payment' }).click()
  await options.beforeChoosing?.()
  await page.getByRole('radio', { name: new RegExp(payment) }).check()
  await page.getByRole('button', { name: 'Review order' }).click()
  await expect(page.getByRole('region', { name: /Review and place order/ })).toBeVisible()
}

/** On the confirmation page: the order number shown to the customer ("NW-10003"). */
export async function orderNumberOnConfirmation(page: Page): Promise<string> {
  await expect(page).toHaveURL(/\/checkout\/success\?order=[0-9a-f-]{36}$/)
  const text = await page.getByText(/^Order number NW-\d+$/).textContent()
  return /NW-\d+/.exec(text ?? '')![0]
}

/** A whole cash-on-delivery purchase of one shirt; returns the order number. */
export async function buyShirtCashOnDelivery(page: Page, size: keyof typeof SHIRT.sizes = 'M') {
  await addShirtToBag(page, size)
  await page.getByRole('dialog').getByRole('link', { name: 'Checkout' }).click()
  await checkoutToReview(page, 'Cash on delivery')
  await page.getByRole('button', { name: 'Place order', exact: true }).click()
  return orderNumberOnConfirmation(page)
}

// ── The admin panel (step 50) ───────────────────────────────────────────────

/**
 * The 2FA code the authenticator app would show for a set-up key. The e2e API
 * signs in through a PRETEND Supabase (apps/api/test/e2e-server.ts) whose
 * "authenticator app" always shows the key's last 6 characters
 * (FakeAuthProvider.codeFor) — the test reads the key off the page like a person.
 */
export const codeFor = (setupKey: string) => setupKey.slice(-6)

/** Types email + password on the admin sign-in page and presses Continue. */
export async function enterAdminPassword(page: Page, account: { email: string; password: string }) {
  await page.goto(`${ADMIN_URL}/admin/login`)
  await page.getByLabel('Email').fill(account.email)
  await page.getByLabel('Password').fill(account.password)
  await page.getByRole('button', { name: 'Continue' }).click()
}

/**
 * First sign-in of an admin (no authenticator app yet): password → the 2FA
 * set-up page → reads the key under "Can't scan it?" → types the code → the
 * dashboard. Returns the key, for a later sign-in in the same spec file.
 */
export async function firstAdminSignIn(
  page: Page,
  account: { email: string; password: string },
): Promise<string> {
  await enterAdminPassword(page, account)
  await expect(
    page.getByRole('heading', { name: 'Set up two-factor authentication' }),
  ).toBeVisible()
  await page.getByText('Can’t scan it?').click()
  const setupKey = (await page.locator('details code').textContent())?.trim() ?? ''
  expect(setupKey).not.toBe('')
  await page.getByLabel('6-digit code').fill(codeFor(setupKey))
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/admin\/dashboard/)
  return setupKey
}
