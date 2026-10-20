// Step 50 — CLAUDE.md §12: "Admin: login → create product → visible on storefront".
// The photo goes to the e2e API's in-memory photo store (never Supabase); its
// address is on a never-existing domain, so the shop shows everything but the picture.
import { ADMIN_URL } from '../support/env.js'
import { CATALOG_ADMIN, CATEGORY, NEW_PRODUCT } from '../support/fixtures.js'
import { firstAdminSignIn } from '../support/flows.js'
import { expect, test } from '../support/test.js'

/** A real 8×8 PNG (the API checks and re-encodes every photo with sharp). */
const PHOTO = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEklEQVR4nGP4z8CAFWEXHbQSACj/P8Fu7N9hAAAAAElFTkSuQmCC',
  'base64',
)

test('a product created in the admin panel is on the shop', async ({ page }) => {
  test.setTimeout(120_000) // includes up to 75 s for the shop's 60 s cache
  await firstAdminSignIn(page, CATALOG_ADMIN)

  // 1. The draft: name, category, price.
  await page.goto(`${ADMIN_URL}/admin/products/new`)
  await page.getByLabel('Product name').fill(NEW_PRODUCT.name)
  await page.getByLabel('Category').selectOption({ label: CATEGORY.name })
  await page.getByLabel('Price (৳)').fill(NEW_PRODUCT.price)
  await page.getByRole('button', { name: 'Create draft' }).click()
  await expect(page).toHaveURL(/\/admin\/products\/[0-9a-f-]{36}$/)

  // 2. A size with stock.
  await page.getByLabel('Colour', { exact: true }).fill('Sand')
  await page.getByLabel('Sizes', { exact: true }).fill(NEW_PRODUCT.size)
  await page.getByLabel('Starting stock (each)').fill(String(NEW_PRODUCT.stock))
  await page.getByRole('button', { name: 'Add size' }).click()
  await expect(page.getByRole('status').filter({ hasText: /added/i })).toBeVisible()

  // 3. A photo (publishing needs one).
  await page.getByLabel('Photo', { exact: true }).setInputFiles({
    name: 'linen-panjabi.png',
    mimeType: 'image/png',
    buffer: PHOTO,
  })
  await page.getByLabel('Alt text').fill('Linen panjabi, front')
  await page.getByRole('button', { name: 'Upload photo' }).click()

  // 4. Publish — the editor then links to the product in the shop.
  await page.getByRole('button', { name: 'Publish' }).click()
  const inShop = page.getByRole('link', { name: 'View in the shop ↗' })
  await expect(inShop).toBeVisible()

  // 5. The shop shows it — "within 60 s" (the spec, CLAUDE.md §12): the shop
  // keeps API answers for 60 s, and under the load of a full test run it could
  // still serve an earlier "no such product" for a moment. So: reload until it's
  // there, at most ~75 s (a product that never appears still fails).
  await page.goto((await inShop.getAttribute('href'))!)
  const heading = page.getByRole('heading', { level: 1, name: NEW_PRODUCT.name })
  await expect(async () => {
    if (!(await heading.isVisible())) await page.reload()
    await expect(heading).toBeVisible({ timeout: 3_000 })
  }).toPass({ timeout: 75_000, intervals: [2_000, 5_000] })
  await expect(page.getByText('৳2,350').first()).toBeVisible()
  await expect(page.getByRole('radio', { name: NEW_PRODUCT.size, exact: true })).toBeEnabled()
})
