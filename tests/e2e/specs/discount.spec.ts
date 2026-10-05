// A discount code: applied in the bag, carried through checkout, on the confirmation.
import { e2eDb } from '../support/db.js'
import { DISCOUNT } from '../support/fixtures.js'
import { addShirtToBag, checkoutToReview, orderNumberOnConfirmation } from '../support/flows.js'
import { expect, test } from '../support/test.js'

test('a discount code takes 10% off and is remembered on the order', async ({ page }) => {
  await addShirtToBag(page)
  await page.goto('/cart')
  await page.getByLabel('Discount code').fill(DISCOUNT.code.toLowerCase()) // codes aren't case-sensitive
  await page.getByRole('button', { name: 'Apply' }).click()
  await expect(page.getByText(`Discount (${DISCOUNT.code})`)).toBeVisible()
  await expect(page.getByText('−৳149')).toBeVisible()

  await page.getByRole('link', { name: 'Checkout' }).click()
  await checkoutToReview(page, 'Cash on delivery')
  // 1490 − 149 + 60 delivery
  await expect(
    page.getByRole('region', { name: /Review and place order/ }).getByText('৳1,401'),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Place order', exact: true }).click()

  const orderNumber = await orderNumberOnConfirmation(page)
  await expect(page.getByText(`Discount (${DISCOUNT.code})`)).toBeVisible()
  await expect(page.getByText(/Please pay ৳1,401 in cash/)).toBeVisible()

  const order = await e2eDb().order.findUniqueOrThrow({
    where: { orderNumber: Number(orderNumber.slice(3)) },
    include: { discountUsage: true },
  })
  expect(order.discountCode).toBe(DISCOUNT.code)
  expect(order.discountUsage).not.toBeNull() // the use was counted
})
