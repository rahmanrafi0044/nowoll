// Accessibility (step 52, WCAG 2.1 AA — docs/accessibility.md): every customer
// page, and the states a customer passes through, scanned by axe.
import { expectAccessible } from '../support/a11y.js'
import type { Locator, Page } from '@playwright/test'
import { ADMIN_URL } from '../support/env.js'
import { A11Y_ADMIN, BLOG_POST, CATEGORY, CUSTOMER, SHIRT, SHOPPER } from '../support/fixtures.js'
import {
  addShirtToBag,
  checkoutToReview,
  firstAdminSignIn,
  orderNumberOnConfirmation,
} from '../support/flows.js'
import { expect, test } from '../support/test.js'

const PAGES = [
  '/',
  '/shop',
  `/shop/${CATEGORY.slug}`,
  `/products/${SHIRT.slug}`,
  '/cart',
  '/orders/track',
  '/login',
  '/register',
  '/forgot-password',
  '/blog',
  `/blog/${BLOG_POST.slug}`,
  '/privacy',
  '/terms',
  '/returns',
  '/no-such-page', // the 404 page
]

test('every customer page passes the automatic WCAG 2.1 AA scan @phone', async ({ page }) => {
  for (const path of PAGES) {
    await page.goto(path)
    await expectAccessible(page, path)
  }
})

test('the phone menu, open @phone', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'phone', 'the menu button only exists on phones')
  await page.goto('/')
  await page.getByRole('button', { name: 'Open menu' }).click()
  await expect(page.getByRole('button', { name: 'Close menu' })).toBeVisible()
  await expectAccessible(page, 'phone menu open')
})

test.describe('first visit', () => {
  test.use({ consentChosen: false })
  test('the cookie banner, and its "Choose" switches', async ({ page }) => {
    await page.goto('/')
    const banner = page.getByRole('region', { name: 'Cookies' })
    await expect(banner).toBeVisible()
    await expectAccessible(page, 'cookie banner')
    await banner.getByRole('button', { name: 'Choose' }).click()
    await expectAccessible(page, 'cookie banner — choices')
  })
})

test('the bag drawer, every checkout step and the confirmation @phone', async ({ page }) => {
  await addShirtToBag(page)
  await expectAccessible(page, 'bag drawer')
  await page.getByRole('dialog').getByRole('link', { name: 'Checkout' }).click()
  await expectAccessible(page, 'checkout — contact')
  // A mistake: the error must be announced and tied to its field (the scan
  // checks names/ARIA; the keyboard test checks it's announced).
  await page.getByRole('button', { name: 'Continue to address' }).click()
  await expectAccessible(page, 'checkout — contact with errors')
  await checkoutToReview(page, 'Cash on delivery')
  await expectAccessible(page, 'checkout — review')
  await page.getByRole('button', { name: 'Place order', exact: true }).click()
  await orderNumberOnConfirmation(page)
  await expectAccessible(page, 'order confirmation')
})

test('a signed-in customer’s account pages', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Email', { exact: true }).fill(SHOPPER.email)
  await page.getByLabel('Password', { exact: true }).fill(SHOPPER.password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/account/)
  for (const path of [
    '/account',
    '/account/orders',
    '/account/addresses',
    '/account/profile',
    '/account/wishlist',
  ]) {
    await page.goto(path)
    await expectAccessible(page, path)
  }
})

// ── What a scanner can't check (step 52) ─────────────────────────────────────

/** Facts about the focused element, read in the page (this test has no DOM types). */
async function focused(page: Page) {
  return page.evaluate(() => {
    type El = {
      tagName: string
      className: string
      textContent: string | null
      nextElementSibling: El | null
      getAttribute(n: string): string | null
      closest(s: string): El | null
    }
    type Style = { outlineStyle: string; outlineWidth: string }
    const g = globalThis as unknown as {
      document: { activeElement: El | null }
      getComputedStyle(e: El, pseudo?: string): Style
    }
    const el = g.document.activeElement
    if (!el || el.tagName === 'BODY') return { what: 'nothing', visible: false, inDialog: false }
    const ring = (s: Style) => s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0
    // The mark may be on the element, on its ::after (a card's stretched link), or —
    // for a visually hidden radio — on the label drawn right after it.
    const visible =
      ring(g.getComputedStyle(el)) ||
      ring(g.getComputedStyle(el, '::after')) ||
      (el.className.includes('sr-only') &&
        !!el.nextElementSibling &&
        ring(g.getComputedStyle(el.nextElementSibling)))
    const name = (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 40)
    return {
      what: `${el.tagName.toLowerCase()} "${name}"`,
      visible,
      inDialog: !!el.closest('dialog[open]'),
    }
  })
}

/** Presses Tab until `target` has focus — checking at every stop that focus can be seen. */
async function tabTo(page: Page, target: Locator, max = 80) {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press('Tab')
    const f = await focused(page)
    if (f.what !== 'nothing') expect.soft(f.visible, `focus can be seen on ${f.what}`).toBe(true)
    if (
      await target.evaluate(
        (el) =>
          el ===
          (globalThis as unknown as { document: { activeElement: unknown } }).document
            .activeElement,
      )
    )
      return
  }
  throw new Error(`Tab never reached ${target.toString()}`)
}

test('a whole purchase with the keyboard only — focus always visible', async ({ page }) => {
  // The skip link comes first: past the header and menu in one key press.
  await page.goto(`/shop/${CATEGORY.slug}`)
  await page.keyboard.press('Tab')
  const skip = page.getByRole('link', { name: 'Skip to main content' })
  await expect(skip).toBeFocused()
  await expect(skip).toBeVisible()

  // A product card in the listing → its page.
  await tabTo(page, page.getByRole('link', { name: SHIRT.name }).first())
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { level: 1, name: SHIRT.name })).toBeVisible()

  // Sizes are a radio group: Tab in, arrow keys choose (the sold-out size is skipped).
  await tabTo(page, page.getByRole('radio', { name: 'M', exact: true }))
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('radio', { name: 'L', exact: true })).toBeChecked()

  const addToBag = page.getByRole('button', { name: 'Add to bag' }).first()
  await tabTo(page, addToBag)
  await page.keyboard.press('Enter')
  const bag = page.getByRole('dialog')
  await expect(bag).toBeVisible()
  // The bag keeps the focus while it's open…
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('Tab')
    const f = await focused(page)
    if (f.what !== 'nothing') expect(f.inDialog, `focus stays in the bag (${f.what})`).toBe(true)
  }
  // …Escape closes it and gives the focus back to the button that opened it.
  await page.keyboard.press('Escape')
  await expect(bag).toBeHidden()
  await expect(addToBag).toBeFocused()

  await page.keyboard.press('Enter')
  await tabTo(page, bag.getByRole('link', { name: 'Checkout' }))
  await page.keyboard.press('Enter')

  // Checkout: a wrong mobile number → the focus lands on that field, with its error.
  await tabTo(page, page.getByLabel('Full name'))
  await page.keyboard.type(CUSTOMER.fullName)
  await page.keyboard.press('Tab')
  await page.keyboard.type(CUSTOMER.email)
  await page.keyboard.press('Tab')
  await page.keyboard.type('12345')
  // Pressed on the button (not in the field), so the focus must MOVE to the mistake.
  await tabTo(page, page.getByRole('button', { name: 'Continue to address' }))
  await page.keyboard.press('Enter')
  const phone = page.getByLabel('Mobile number')
  await expect(phone).toBeFocused()
  await expect(phone).toHaveAttribute('aria-invalid', 'true')
  await expect(phone).toHaveAccessibleDescription(/valid Bangladeshi mobile number/)
  await page.keyboard.press('ControlOrMeta+A')
  await page.keyboard.type(CUSTOMER.phone)
  await page.keyboard.press('Enter')

  // Address: sent empty → the first missing field gets the focus.
  await tabTo(page, page.getByRole('button', { name: 'Continue to delivery' }))
  await page.keyboard.press('Enter')
  const division = page.getByRole('combobox', { name: 'Division', exact: true })
  await expect(division).toBeFocused()
  await expect(division).toHaveAccessibleDescription('Choose a division')
})

test('no sideways scrolling on a 320 px screen (= 200% zoom on a laptop) @phone', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 640 })
  for (const path of ['/', '/shop', `/products/${SHIRT.slug}`, '/orders/track', '/blog']) {
    await page.goto(path)
    const overflow = await page.evaluate(() => {
      const d = (
        globalThis as unknown as {
          document: { documentElement: { scrollWidth: number; clientWidth: number } }
        }
      ).document.documentElement
      return d.scrollWidth - d.clientWidth
    })
    expect
      .soft(overflow, `${path} is wider than the screen by ${overflow}px`)
      .toBeLessThanOrEqual(0)
  }
})

// The admin panel: the automatic scan only (Rafi's decision A — customers use
// the shop; staff use the admin). Every list and "new" page of the panel.
const ADMIN_PAGES = [
  'dashboard',
  'orders',
  'returns',
  'products',
  'products/new',
  'products/import',
  'inventory',
  'inventory/low-stock',
  'categories',
  'categories/new',
  'customers',
  'discounts',
  'discounts/new',
  'shipping',
  'shipping/new',
  'content',
  'content/homepage',
  'content/announcement',
  'content/menu',
  'content/footer',
  'content/pages',
  'content/blog',
  'content/emails',
  'content/product-info',
  'content/redirects',
  'marketing',
  'newsletter',
  'analytics',
  'staff',
  'settings',
]

test('the admin panel passes the automatic WCAG 2.1 AA scan', async ({ page }) => {
  test.setTimeout(180_000) // 30 pages
  await page.goto(`${ADMIN_URL}/admin/login`)
  await expectAccessible(page, '/admin/login')
  await firstAdminSignIn(page, A11Y_ADMIN)
  for (const path of ADMIN_PAGES) {
    await page.goto(`${ADMIN_URL}/admin/${path}`)
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
    await expectAccessible(page, `/admin/${path}`)
  }
})
