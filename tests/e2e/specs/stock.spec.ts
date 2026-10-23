// Sold-out sizes, and stock that runs out while the customer is checking out.
import { e2eDb, setStock, stockOf } from '../support/db.js'
import { SHIRT } from '../support/fixtures.js'
import { addShirtToBag, addToBagButton, checkoutToReview, chooseSize } from '../support/flows.js'
import { expect, test } from '../support/test.js'

test('a sold-out size offers "Notify me when it\'s back" instead of Add to bag (38f)', async ({
  page,
}) => {
  await page.goto(`/products/${SHIRT.slug}`)
  await chooseSize(page, `${SHIRT.soldOutSize} (out of stock)`)
  await expect(addToBagButton(page)).toBeHidden()
  const email = `waiting-${Date.now()}@example.com`
  await page.getByRole('textbox', { name: 'Your email', exact: true }).fill(email)
  await page.getByRole('button', { name: 'Notify me' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'we’ll email you once' })).toBeVisible()
  const saved = await e2eDb().stockAlert.findFirst({ where: { email } })
  expect(saved).toMatchObject({ notifiedAt: null })

  // An in-stock size brings Add to bag back.
  await chooseSize(page, 'M')
  await expect(addToBagButton(page)).toBeEnabled()
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
