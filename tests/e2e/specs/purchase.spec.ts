// The most important journey (CLAUDE.md §12): homepage → category → product
// → bag → checkout → confirmation. Tagged @phone: it also runs on a phone screen.
import { e2eDb, stockOf } from '../support/db.js'
import { CATEGORY, CUSTOMER, SHIRT } from '../support/fixtures.js'
import {
  addToBagButton,
  checkoutToReview,
  chooseSize,
  orderNumberOnConfirmation,
} from '../support/flows.js'
import { expect, test } from '../support/test.js'

test('a guest buys a shirt with cash on delivery, from the homepage @phone', async ({ page }) => {
  const stockBefore = await stockOf(SHIRT.sizes.M)

  // Homepage → category → product
  await page.goto('/')
  await page
    .getByRole('region', { name: 'Shop by category' })
    .getByRole('link', { name: new RegExp(CATEGORY.name) })
    .click()
  await expect(page).toHaveURL(new RegExp(`/shop/${CATEGORY.slug}$`))
  await page
    .getByRole('link', { name: new RegExp(SHIRT.name) })
    .first()
    .click()
  await expect(page.getByRole('heading', { level: 1, name: SHIRT.name })).toBeVisible()

  // Choose a size → bag
  await expect(addToBagButton(page, 'Choose a size')).toBeDisabled()
  await chooseSize(page, 'M')
  await addToBagButton(page).click()
  const bag = page.getByRole('dialog')
  await expect(bag.getByText(SHIRT.name)).toBeVisible()
  await expect(bag.getByText('M / Blue')).toBeVisible()
  await bag.getByRole('link', { name: 'Checkout' }).click()

  // Checkout → review: ৳1,490 + ৳60 delivery inside Dhaka
  await checkoutToReview(page, 'Cash on delivery')
  const review = page.getByRole('region', { name: /Review and place order/ })
  await expect(
    review.getByText(`${CUSTOMER.fullName} · ${CUSTOMER.email} · ${CUSTOMER.phoneNormalized}`),
  ).toBeVisible()
  await expect(review.getByText('৳1,550')).toBeVisible()
  await review.getByRole('button', { name: 'Place order', exact: true }).click()

  // The confirmation page
  const orderNumber = await orderNumberOnConfirmation(page)
  await expect(
    page.getByRole('heading', { name: 'Thank you — your order is placed!' }),
  ).toBeVisible()
  await expect(page.getByText(/Please pay ৳1,550 in cash/)).toBeVisible()
  await expect(page.getByText(SHIRT.name)).toBeVisible()
  await expect(page.getByText(`${CUSTOMER.address}, ${CUSTOMER.area}, Dhaka, Dhaka`)).toBeVisible()

  // …and it really happened: the order is saved and the shirt is reserved.
  const order = await e2eDb().order.findUniqueOrThrow({
    where: { orderNumber: Number(orderNumber.slice(3)) },
  })
  expect(order).toMatchObject({
    status: 'PENDING',
    paymentMethod: 'COD',
    phone: CUSTOMER.phoneNormalized,
  })
  expect(order.total.toString()).toBe('1550')
  expect(await stockOf(SHIRT.sizes.M)).toBe(stockBefore - 1)

  // "Back" doesn't return to a finished checkout; the bag is empty.
  await page.goto('/checkout')
  await expect(page.getByText('Your bag is empty')).toBeVisible()
})
