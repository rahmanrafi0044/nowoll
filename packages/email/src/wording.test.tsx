// Step 43b — the admin's email wording: subject, heading, opening; footer; logo.
import { EXAMPLES } from './examples.js'
import { renderEmail } from './render.js'
import type { StoreBrand } from './brand.js'

const store = (over: Partial<StoreBrand> = {}): StoreBrand => ({
  name: 'Nowoll',
  tagline: 'always new',
  ...over,
})
const LOGO = 'https://x.supabase.co/storage/v1/object/public/product-images/branding/logo-1.png'

describe('email wording (step 43b)', () => {
  it('empty wording → exactly today’s email', async () => {
    const plain = await renderEmail(EXAMPLES.shipped!, store())
    const empty = await renderEmail(
      EXAMPLES.shipped!,
      store({ wording: { 'order-shipped': { subject: '', heading: ' ', intro: '' } }, footer: '' }),
    )
    expect(empty).toEqual(plain)
  })

  it('subject, heading and opening replaced, placeholders filled; the facts stay', async () => {
    const email = await renderEmail(
      EXAMPLES.shipped!,
      store({
        wording: {
          'order-shipped': {
            subject: '{name}, {order} is coming!',
            heading: 'On its way from {store}',
            intro: 'Our team packed it with care.\nSee you soon!',
          },
        },
      }),
    )
    expect(email.subject).toBe('Rafi, NW-10001 is coming!')
    expect(email.text).toContain('On its way from Nowoll')
    expect(email.text).toContain('Our team packed it with care.')
    expect(email.text).toContain('See you soon!')
    expect(email.text).not.toContain('Good news') // the built-in opening is replaced…
    expect(email.text).toMatch(/Order number: NW-10001/) // …but its fact stays
    expect(email.text).toMatch(/Tracking number/) // and every other fact
  })

  it('cash on delivery: your opening is added — "pay ৳X in cash" is always there', async () => {
    const email = await renderEmail(
      EXAMPLES.orderConfirmation!,
      store({ wording: { 'order-confirmation': { intro: 'Eid Mubarak from all of us!' } } }),
    )
    expect(email.text).toContain('Eid Mubarak from all of us!')
    expect(email.text).toMatch(/Please pay ৳2,742 in cash/)
    expect(email.text).toContain('Order number: NW-10001')
  })

  it('payment and refund: the amount stays even when the opening is replaced', async () => {
    const paid = await renderEmail(
      EXAMPLES.paymentConfirmed!,
      store({ wording: { 'payment-confirmed': { intro: 'Thank you so much!' } } }),
    )
    expect(paid.text).toMatch(/Paid: ৳3,550/)
    const refund = await renderEmail(
      EXAMPLES.refundProcessed!,
      store({
        wording: {
          'refund-processed': {
            subject: 'Your {amount} is back',
            intro: 'Sorry it didn’t work out.',
          },
        },
      }),
    )
    expect(refund.subject).toMatch(/^Your ৳[\d,]+ is back$/)
    expect(refund.text).toMatch(/Refunded: ৳[\d,]+ for order NW-10001/)
  })

  it('what customers typed or the admin wrote is text, never HTML', async () => {
    const email = await renderEmail(
      EXAMPLES.welcome!,
      store({
        wording: { welcome: { heading: '<b>Hi</b> {name}', intro: '<script>alert(1)</script>' } },
      }),
    )
    expect(email.html).not.toContain('<script>alert(1)</script>')
    expect(email.html).not.toContain('<b>Hi</b>')
    expect(email.html).toContain('&lt;b&gt;Hi&lt;/b&gt; Rafi')
  })

  it('footer: your line, or the built-in one; the newsletter keeps its own (with unsubscribe)', async () => {
    const own = await renderEmail(EXAMPLES.welcome!, store({ footer: 'Nowoll, Dhanmondi, Dhaka' }))
    expect(own.text).toContain('Nowoll, Dhanmondi, Dhaka')
    expect(own.text).not.toContain("You're receiving this")
    const news = await renderEmail(EXAMPLES.newsletterConfirm!, store({ footer: 'Nowoll, Dhaka' }))
    expect(news.text).toMatch(/unsubscribe/i)
  })

  it('logo: a PNG/JPEG logo replaces the name at the top; WebP or http never used', async () => {
    const withLogo = await renderEmail(EXAMPLES.welcome!, store({ logoUrl: LOGO }))
    expect(withLogo.html).toContain(`src="${LOGO}"`)
    expect(withLogo.html).toContain('alt="Nowoll"')
    for (const bad of [LOGO.replace('.png', '.webp'), LOGO.replace('https', 'http')]) {
      const email = await renderEmail(EXAMPLES.welcome!, store({ logoUrl: bad }))
      expect(email.html).not.toContain('<img')
    }
  })
})
