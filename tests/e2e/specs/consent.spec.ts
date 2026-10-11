// The cookie banner decides what tracking loads (step 39a, docs/integrations/analytics.md).
import type { Page } from '@playwright/test'
import { SHIRT, TRACKING } from '../support/fixtures.js'
import { addShirtToBag } from '../support/flows.js'
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
