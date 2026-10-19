// The cookie banner decides what tracking loads (step 39a, docs/integrations/analytics.md).
import { CONSENT_STORAGE_KEY, ONLY_NECESSARY, serializeConsent } from '@nowoll/analytics'
import type { Page } from '@playwright/test'
import { SHIRT, TRACKING } from '../support/fixtures.js'
import { e2eDb } from '../support/db.js'
import { addShirtToBag, buyShirtCashOnDelivery } from '../support/flows.js'
import { expect, test, TRACKING_HOSTS } from '../support/test.js'

test.use({ consentChosen: false })

/** Every request the shop tries to make to Google or Meta (answered with an empty script). */
async function watchTracking(page: Page): Promise<string[]> {
  const seen: string[] = []
  await page.route(TRACKING_HOSTS, (route) => {
    seen.push(route.request().url())
    return route.fulfill({ status: 200, contentType: 'text/javascript', body: '' })
  })
  return seen
}

const banner = (page: Page) => page.getByRole('region', { name: 'Cookies' })

test('nothing tracks before the customer chooses, nor after "Only necessary"', async ({ page }) => {
  const seen = await watchTracking(page)
  await page.goto(`/products/${SHIRT.slug}`)
  await expect(banner(page)).toBeVisible()
  await addShirtToBag(page) // shopping works without answering
  expect(seen).toEqual([])
  await page.keyboard.press('Escape') // close the bag (a pop-up covers the page, banner included)
  await expect(page.getByRole('dialog')).toBeHidden()

  await banner(page).getByRole('button', { name: 'Only necessary' }).click()
  await expect(banner(page)).toBeHidden()
  await page.reload()
  await expect(page.getByRole('heading', { level: 1, name: SHIRT.name })).toBeVisible()
  await expect(banner(page)).toBeHidden() // remembered
  expect(seen).toEqual([])
})

test('"Accept all" loads the official scripts with the admin IDs; Cookie settings can take it back', async ({
  page,
}) => {
  const seen = await watchTracking(page)
  await page.goto(`/products/${SHIRT.slug}`)
  await banner(page).getByRole('button', { name: 'Accept all' }).click()

  await expect
    .poll(() => seen)
    .toEqual(
      expect.arrayContaining([
        `https://www.googletagmanager.com/gtag/js?id=${TRACKING.ga4}`,
        'https://connect.facebook.net/en_US/fbevents.js',
      ]),
    )
  // The product view waited for the choice, then reached Meta with its event ID.
  const queued = await page.evaluate(() =>
    ((globalThis as unknown as { fbq: { queue: IArguments[] } }).fbq.queue ?? []).map((a) =>
      Array.from(a),
    ),
  )
  expect(queued).toContainEqual(['init', TRACKING.pixel])
  expect(queued).toContainEqual([
    'track',
    'ViewContent',
    expect.objectContaining({ content_ids: [SHIRT.id], currency: 'BDT' }),
    { eventID: expect.any(String) },
  ])

  // Change of mind from the footer → the page reloads without the tools.
  await page.getByRole('contentinfo').getByRole('button', { name: 'Cookie settings' }).click()
  await banner(page)
    .getByRole('checkbox', { name: /Marketing/ })
    .uncheck()
  await banner(page)
    .getByRole('checkbox', { name: /Analytics/ })
    .uncheck()
  const before = seen.length
  await Promise.all([
    page.waitForEvent('load'),
    banner(page).getByRole('button', { name: 'Save my choices' }).click(),
  ])
  await expect(page.getByRole('heading', { level: 1, name: SHIRT.name })).toBeVisible()
  expect(seen.slice(before)).toEqual([]) // nothing loaded again
  expect(await page.evaluate(() => typeof (globalThis as unknown as { fbq?: unknown }).fbq)).toBe(
    'undefined',
  )
})

// Step 39b: the order carries the customer's consent for Meta's server events.
const trackingOf = async (orderNumber: string) =>
  e2eDb().orderTracking.findFirst({
    where: { order: { orderNumber: Number(orderNumber.replace('NW-', '')) } },
  })

test('Marketing allowed → the order keeps the browser details for Meta (with the _fbp cookie)', async ({
  page,
  context,
}) => {
  await watchTracking(page)
  await page.goto('/')
  await banner(page).getByRole('button', { name: 'Accept all' }).click()
  // The real Pixel would set this cookie; here its script is a stand-in, so we set it.
  const { hostname } = new URL(page.url())
  await context.addCookies([
    { name: '_fbp', value: 'fb.1.1760000000000.1234567890', domain: hostname, path: '/' },
  ])
  const orderNumber = await buyShirtCashOnDelivery(page)
  expect(await trackingOf(orderNumber)).toMatchObject({
    fbp: 'fb.1.1760000000000.1234567890',
    userAgent: expect.stringContaining('Mozilla'),
    sourceUrl: expect.stringMatching(/\/checkout$/),
  })
})

test('"Only necessary" → the order keeps nothing for Meta', async ({ page }) => {
  await watchTracking(page)
  await page.goto('/')
  await banner(page).getByRole('button', { name: 'Only necessary' }).click()
  const orderNumber = await buyShirtCashOnDelivery(page)
  expect(await trackingOf(orderNumber)).toBeNull()
})

// Speed (step 51): the banner is in the page's HTML, so a first-time visitor
// sees it before any JavaScript has run; a returning visitor's saved choice is
// checked by a tiny script before the first paint, so it never flashes for them.
// Blocking the shop's JavaScript files (React never starts) proves both.
test.describe('the banner without waiting for JavaScript', () => {
  const blockShopScripts = (page: Page) =>
    page.route('**/_next/static/chunks/*.js', (route) => route.abort())

  test('a first-time visitor sees it straight from the HTML', async ({ page }) => {
    await blockShopScripts(page)
    await page.goto('/')
    await expect(banner(page)).toBeVisible()
    await expect(banner(page)).toHaveAttribute('data-consent-banner', 'before-load')
  })

  test('a returning visitor never sees it — not even for a moment', async ({ page }) => {
    await page.addInitScript(
      ([key, value]) => localStorage.setItem(key!, value!),
      [CONSENT_STORAGE_KEY, serializeConsent(ONLY_NECESSARY, new Date())],
    )
    await blockShopScripts(page)
    await page.goto('/')
    // It is in the HTML, but hidden by the early check (React can't remove it here).
    const early = page.locator('[data-consent-banner="before-load"]')
    await expect(early).toHaveCount(1)
    await expect(early).toBeHidden()
  })
})
