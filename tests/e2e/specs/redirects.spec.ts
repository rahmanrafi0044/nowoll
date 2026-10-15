// Step 43c — an old web address sends visitors to the new one (the real proxy).
import { OLD_SHIRT_PATH, SHIRT } from '../support/fixtures.js'
import { expect, test } from '../support/test.js'

test('an old address → 301 to the new one, keeping ?utm…; the page shows', async ({ page }) => {
  const res = await page.request.get(`${OLD_SHIRT_PATH}?utm_source=facebook`, { maxRedirects: 0 })
  expect(res.status()).toBe(301)
  expect(res.headers().location).toMatch(
    new RegExp(`/products/${SHIRT.slug}\\?utm_source=facebook$`),
  )

  await page.goto(`${OLD_SHIRT_PATH}/?utm_source=facebook`) // a trailing slash and capitals don't matter
  await expect(page).toHaveURL(new RegExp(`/products/${SHIRT.slug}\\?utm_source=facebook$`))
  await expect(page.getByRole('heading', { level: 1, name: SHIRT.name })).toBeVisible()
})

test('unknown addresses still show “Page not found”; files are untouched', async ({ page }) => {
  const res = await page.request.get('/no-such-page', { maxRedirects: 0 })
  expect(res.status()).toBe(404)
  // A file address (has an extension, like a photo) passes the proxy untouched.
  // robots.txt always exists — the demo photos are generated locally, not in git.
  expect((await page.request.get('/robots.txt', { maxRedirects: 0 })).status()).toBe(200)
})
