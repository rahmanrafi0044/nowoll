import { readFileSync } from 'node:fs'
import path from 'node:path'
import { EXAMPLES, link, lines, SITE, totals } from './examples.js'
import { orderLink } from './links.js'
import { renderEmail } from './render.js'
import { lowStockEmail } from './templates/admin.js'
import {
  orderConfirmationEmail,
  orderShippedEmail,
  refundProcessedEmail,
  welcomeEmail,
} from './templates/customer.js'

describe('every template', () => {
  it.each(Object.entries(EXAMPLES))(
    '%s renders HTML + plain text with nothing missing',
    async (_name, content) => {
      const email = await renderEmail(content)
      expect(email.subject.length).toBeGreaterThan(5)
      expect(email.html).toMatch(/^<!DOCTYPE html/i)
      expect(email.text.length).toBeGreaterThan(40)
      for (const out of [email.subject, email.html, email.text])
        expect(out).not.toMatch(/undefined|\[object Object\]|NaN|null/)
      expect(email.text).toContain('Nowoll')
    },
  )
})

describe('content', () => {
  it("order confirmation: receipt with the shop's money format, discount line, no 0% VAT line", async () => {
    const email = await renderEmail(EXAMPLES.orderConfirmation!)
    expect(email.subject).toBe('Order NW-10001 — thank you!')
    expect(email.text).toMatch(/Please pay ৳2,742 in cash/)
    expect(email.text).toContain('Discount (TEN)')
    expect(email.text).toContain('−৳298')
    expect(email.text).not.toContain('VAT')
    expect(email.text).toContain('6 October 2026')
  })

  it('online orders: no "pay in cash" line', async () => {
    const email = await renderEmail(
      orderConfirmationEmail({ ...exampleConfirmation(), paymentMethod: 'SSLCOMMERZ' }),
    )
    expect(email.text).not.toMatch(/in cash/)
    expect(email.text).toMatch(/as soon as your online payment is confirmed/)
  })

  it('anything a customer typed is escaped — never HTML', async () => {
    const email = await renderEmail(
      welcomeEmail({ name: '<script>alert(1)</script> Evil', shopUrl: SITE }),
    )
    expect(email.html).not.toContain('<script>alert(1)')
    expect(email.html).toContain('&lt;script&gt;')
  })

  it('shipped: courier and tracking number only when there is one', async () => {
    expect((await renderEmail(EXAMPLES.shipped!)).text).toMatch(/Tracking number: SF123456/)
    const none = await renderEmail(
      orderShippedEmail({
        name: 'R',
        orderNumber: 'NW-1',
        courierName: null,
        trackingNumber: null,
        link,
      }),
    )
    expect(none.text).not.toMatch(/Tracking number/)
  })

  it('refund: wording depends on how the money goes back', async () => {
    expect((await renderEmail(EXAMPLES.refundProcessed!)).text).toMatch(
      /card or wallet you paid with/,
    )
    const manual = await renderEmail(
      refundProcessedEmail({
        name: 'R',
        orderNumber: 'NW-1',
        amount: '500',
        method: 'MANUAL',
        link,
      }),
    )
    expect(manual.text).toMatch(/sent it to you directly/)
    expect(manual.subject).toBe('Refund of ৳500 — order NW-1')
  })

  it('newsletter: confirm button and an unsubscribe link', async () => {
    const email = await renderEmail(EXAMPLES.newsletterConfirm!)
    expect(email.html).toContain('href="https://nowoll.com/newsletter/confirm?token=abc"')
    expect(email.html).toContain('href="https://nowoll.com/newsletter/unsubscribe?token=abc"')
  })

  it('low stock: one item in the subject; several counted', async () => {
    expect((await renderEmail(EXAMPLES.lowStock!)).subject).toBe(
      'Low stock: Oxford Shirt (M / Blue) — 3 left',
    )
    const two = lowStockEmail({
      items: [
        { productName: 'A', variantLabel: 'M', sku: 'A1', stock: 0, threshold: 5 },
        { productName: 'B', variantLabel: 'L', sku: 'B1', stock: 2, threshold: 5 },
      ],
      inventoryUrl: SITE,
    })
    const email = await renderEmail(two)
    expect(email.subject).toBe('Low stock: 2 items')
    expect(email.text).toContain('Sold out')
  })
})

describe('links', () => {
  it('signed-in → the order page; guest → the tracking page (no private order link in emails)', () => {
    expect(orderLink(`${SITE}/`, { number: 'NW-10001', signedIn: true })).toEqual({
      url: 'https://nowoll.com/account/orders/NW-10001',
      label: 'View your order',
    })
    expect(orderLink(SITE, { number: 'NW-10001', signedIn: false })).toEqual({
      url: 'https://nowoll.com/orders/track',
      label: 'Track your order',
    })
  })
})

describe('Supabase reset-password template', () => {
  it("keeps Supabase's own placeholders for the link", async () => {
    const email = await renderEmail(EXAMPLES.resetPassword!)
    expect(email.html).toContain(
      'href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&amp;type=recovery"',
    )
  })

  it('the committed copy (to paste into Supabase) is up to date — run `pnpm email:preview` to refresh it', async () => {
    const committed = readFileSync(
      path.resolve(import.meta.dirname, '../../../docs/integrations/supabase-reset-password.html'),
      'utf8',
    )
    expect(committed).toBe((await renderEmail(EXAMPLES.resetPassword!)).html)
  })
})

function exampleConfirmation() {
  return {
    name: 'Rafi Rahman',
    orderNumber: 'NW-10001',
    placedAt: '2026-10-06T04:00:00.000Z',
    paymentMethod: 'COD' as const,
    lines,
    totals,
    address: 'House 12',
    link,
  }
}
