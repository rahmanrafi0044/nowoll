// The steps several tests share, written the way a customer does them:
// by visible labels and buttons, never by CSS classes or test ids.
import type { Page } from '@playwright/test'
import { expect } from './test.js'
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
