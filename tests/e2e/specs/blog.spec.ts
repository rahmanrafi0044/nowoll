// Step 43 — the blog: from the footer to a post, with "Shop the look".
import { BLOG_POST, SHIRT } from '../support/fixtures.js'
import { expect, test } from '../support/test.js'

test('the footer links to the blog; a post opens with its products', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('contentinfo').getByRole('link', { name: 'Blog', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Blog' })).toBeVisible()

  await page.getByRole('link', { name: BLOG_POST.title }).click()
  await expect(page).toHaveURL(new RegExp(`/blog/${BLOG_POST.slug}$`))
  await expect(page.getByRole('heading', { level: 1, name: BLOG_POST.title })).toBeVisible()
  await expect(page.getByRole('heading', { level: 2, name: 'Three ways' })).toBeVisible()

  const look = page.getByRole('region', { name: 'Shop the look' })
  await expect(look.getByRole('link', { name: new RegExp(SHIRT.name) }).first()).toBeVisible()

  // Google's structured data is on the page.
  const ld = await page.locator('script[type="application/ld+json"]').allTextContents()
  expect(ld.map((t) => JSON.parse(t)['@type'])).toContain('BlogPosting')
})

test('sitemap.xml lists the post; robots.txt points to it', async ({ page }) => {
  const sitemap = await (await page.request.get('/sitemap.xml')).text()
  expect(sitemap).toContain(`/blog/${BLOG_POST.slug}</loc>`)
  expect(sitemap).toContain(`/products/${SHIRT.slug}</loc>`)
  const robots = await (await page.request.get('/robots.txt')).text()
  expect(robots).toMatch(/Sitemap: .*\/sitemap\.xml/)
})
