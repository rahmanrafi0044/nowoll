// Step 42 — signing up for the newsletter from the checkout box and the footer.
import { e2eDb } from '../support/db.js'
import { CUSTOMER } from '../support/fixtures.js'
import { addShirtToBag, checkoutToReview, orderNumberOnConfirmation } from '../support/flows.js'
import { expect, test } from '../support/test.js'

test('checkout: the box starts unticked; ticked → waiting for the confirmation email', async ({
  page,
}) => {
  await addShirtToBag(page)
  await page.getByRole('dialog').getByRole('link', { name: 'Checkout' }).click()
  await checkoutToReview(page, 'Cash on delivery')
  const box = page.getByRole('checkbox', { name: /Email me new arrivals/ })
  await expect(box).not.toBeChecked()
  await box.check()
  await page.getByRole('button', { name: 'Place order', exact: true }).click()
  await orderNumberOnConfirmation(page)

  await expect
    .poll(() => e2eDb().subscriber.findUnique({ where: { email: CUSTOMER.email.toLowerCase() } }))
    .toMatchObject({ status: 'PENDING', source: 'checkout' })
})

test('footer: sign up from any page', async ({ page }) => {
  const email = `footer-${Date.now()}@example.com`
  await page.goto('/shop')
  const footer = page.getByRole('region', { name: 'Get new arrivals by email' })
  await footer.getByLabel('Your email for the newsletter').fill(email)
  await footer.getByRole('button', { name: 'Sign up' }).click()
  await expect(footer.getByRole('status')).toHaveText(/confirm by email/)
  expect(await e2eDb().subscriber.findUnique({ where: { email } })).toMatchObject({
    status: 'PENDING',
    source: 'footer',
  })
})
