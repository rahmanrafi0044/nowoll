// Online payment while SSLCommerz isn't set up (as in these tests, and in
// development). Since step 38c the API says so in the checkout summary, so
// "Pay online" is greyed out WITH the reason before the customer picks it —
// and they pay cash on delivery instead.
// Real SSLCommerz pages are tested by hand in the sandbox (docs/integrations/sslcommerz.md).
import { addShirtToBag, checkoutToReview, orderNumberOnConfirmation } from '../support/flows.js'
import { expect, test } from '../support/test.js'

test('"Pay online" not set up → greyed out with the reason → cash on delivery → order placed', async ({
  page,
}) => {
  await addShirtToBag(page)
  await page.getByRole('dialog').getByRole('link', { name: 'Checkout' }).click()
  await checkoutToReview(page, 'Cash on delivery', {
    beforeChoosing: async () => {
      await expect(page.getByRole('radio', { name: /Pay online/ })).toBeDisabled()
      await expect(page.getByText("Online payment isn't available right now")).toBeVisible()
    },
  })
  await page.getByRole('button', { name: 'Place order', exact: true }).click()

  await orderNumberOnConfirmation(page)
  await expect(
    page.getByRole('heading', { name: 'Thank you — your order is placed!' }),
  ).toBeVisible()
})
