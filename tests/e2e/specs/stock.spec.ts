// Sold-out sizes, and stock that runs out while the customer is checking out.
import { e2eDb, setStock, stockOf } from '../support/db.js'
import { SHIRT } from '../support/fixtures.js'
import { addShirtToBag, checkoutToReview } from '../support/flows.js'
import { expect, test } from '../support/test.js'

test('a sold-out size cannot be chosen', async ({ page }) => {
  await page.goto(`/products/${SHIRT.slug}`)
  await expect(
    page.getByRole('radio', { name: `${SHIRT.soldOutSize} (out of stock)` }),
  ).toBeDisabled()
  await expect(page.getByRole('radio', { name: 'M', exact: true })).toBeEnabled()
})

test.describe('stock runs out between review and "Place order"', () => {
  // Size L only: other tests buy M, so this one can empty L without affecting them.
  test.afterEach(() => setStock(SHIRT.sizes.L, SHIRT.stock))

  test('the order is refused, nothing is taken, the customer is sent back to the bag', async ({
    page,
  }) => {
    await addShirtToBag(page, 'L')
    await page.getByRole('dialog').getByRole('link', { name: 'Checkout' }).click()
    await checkoutToReview(page, 'Cash on delivery')
    const ordersBefore = await e2eDb().order.count()

    await setStock(SHIRT.sizes.L, 0) // someone else bought the last one a second ago
    await page.getByRole('button', { name: 'Place order', exact: true }).click()

    await expect(page.getByRole('alert').filter({ hasText: 'just sold out' })).toBeVisible()
    await page.getByRole('link', { name: 'Review your bag' }).click()
    await expect(page).toHaveURL(/\/cart$/)
    expect(await e2eDb().order.count()).toBe(ordersBefore)
    expect(await stockOf(SHIRT.sizes.L)).toBe(0) // never negative
  })
})
