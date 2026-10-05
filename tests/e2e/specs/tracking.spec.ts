// "Track your order" without an account (step 21).
import { CUSTOMER } from '../support/fixtures.js'
import { buyShirtCashOnDelivery } from '../support/flows.js'
import { expect, test } from '../support/test.js'

test('a customer finds their order with its number and their mobile number', async ({ page }) => {
  const orderNumber = await buyShirtCashOnDelivery(page)

  // From the footer, like a customer who comes back later.
  await page.goto('/')
  await page.getByRole('contentinfo').getByRole('link', { name: 'Track your order' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Track your order' })).toBeVisible()

  await page.getByLabel('Order number').fill(orderNumber.toLowerCase().replace('-', '')) // "nw10003"
  await page.getByLabel('Email or mobile number').fill(CUSTOMER.phone)
  await page.getByRole('button', { name: 'Track order' }).click()

  await expect(page.getByRole('heading', { name: `Order ${orderNumber}` })).toBeVisible()
  const progress = page.getByRole('list', { name: 'Order progress' })
  await expect(progress.getByRole('listitem').first()).toContainText('Order placed (done)')
  await expect(progress.getByRole('listitem').nth(1)).toContainText('Confirmed (not yet)')
  await expect(page.getByText(`${CUSTOMER.area}, Dhaka, Dhaka`)).toBeVisible()
  await expect(page.getByText(CUSTOMER.address)).toHaveCount(0) // never the street address
})

test('the wrong email finds nothing — and says so without hinting why', async ({ page }) => {
  const orderNumber = await buyShirtCashOnDelivery(page)
  await page.goto('/orders/track')
  await page.getByLabel('Order number').fill(orderNumber)
  await page.getByLabel('Email or mobile number').fill('someone.else@example.com')
  await page.getByRole('button', { name: 'Track order' }).click()
  await expect(
    page.getByRole('alert').filter({ hasText: "We couldn't find an order with those details" }),
  ).toBeVisible()
})
