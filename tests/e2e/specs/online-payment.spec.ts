// Online payment while SSLCommerz isn't set up (as in these tests, and in
// development): the customer is told, and can switch to cash on delivery.
// Real SSLCommerz pages are tested by hand in the sandbox (docs/integrations/sslcommerz.md).
import { addShirtToBag, checkoutToReview, orderNumberOnConfirmation } from '../support/flows.js'
import { expect, test } from '../support/test.js'

test('"Pay online" not available → choose another way to pay → order placed', async ({ page }) => {
  await addShirtToBag(page)
  await page.getByRole('dialog').getByRole('link', { name: 'Checkout' }).click()
  await checkoutToReview(page, 'Pay online')
  await page.getByRole('button', { name: 'Place order and pay' }).click()

  await expect(
    page.getByRole('alert').filter({ hasText: "Online payment isn't available right now" }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Choose another way to pay' }).click()
  await page.getByRole('radio', { name: /Cash on delivery/ }).check()
  await page.getByRole('button', { name: 'Review order' }).click()
  await page.getByRole('button', { name: 'Place order', exact: true }).click()

  await orderNumberOnConfirmation(page)
  await expect(
    page.getByRole('heading', { name: 'Thank you — your order is placed!' }),
  ).toBeVisible()
})
