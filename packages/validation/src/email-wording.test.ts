import { describe, expect, it } from 'vitest'
import { emailWordingSchema, fillPlaceholders, placeholdersIn } from './email-wording.js'

const parse = (v: object) => emailWordingSchema.safeParse(v)

describe('email wording (step 43b)', () => {
  it('empty = today’s wording; texts trimmed', () => {
    expect(parse({}).data).toEqual({ footer: '', showLogo: false, emails: {} })
    expect(
      parse({ emails: { welcome: { subject: '  Welcome to {store}! ' } } }).data?.emails.welcome,
    ).toEqual({ subject: 'Welcome to {store}!', heading: '', intro: '' })
  })

  it('only the placeholders each email knows — a typo is refused, with the right ones named', () => {
    expect(
      parse({ emails: { 'order-shipped': { subject: 'Order {order} is on its way, {name}' } } })
        .success,
    ).toBe(true)
    const typo = parse({ emails: { 'order-shipped': { intro: 'Hi {nmae}' } } })
    expect(typo.success).toBe(false)
    expect(typo.error?.issues[0]?.message).toMatch(
      /“\{nmae\}” isn’t known here — use \{name\}, \{order\}, \{store\}/,
    )
    // {amount} exists for refunds, not for the welcome email
    expect(parse({ emails: { 'refund-processed': { subject: '{amount} back' } } }).success).toBe(
      true,
    )
    expect(parse({ emails: { welcome: { subject: '{amount}' } } }).success).toBe(false)
  })

  it('subjects and headings are one line; lengths limited; unknown emails refused', () => {
    expect(parse({ emails: { welcome: { subject: 'a\nb' } } }).success).toBe(false)
    expect(parse({ emails: { welcome: { intro: 'x'.repeat(601) } } }).success).toBe(false)
    expect(parse({ emails: { 'secret-email': { subject: 'x' } } }).success).toBe(false)
    expect(parse({ footer: 'x'.repeat(301) }).success).toBe(false)
    expect(parse({ emails: { welcome: { intro: 'line one\nline two' } } }).success).toBe(true)
  })

  it('filling placeholders: known ones replaced, anything left over dropped', () => {
    expect(
      fillPlaceholders('Hi {name}, order {order}{oops}', { name: 'Rafi', order: 'NW-1' }),
    ).toBe('Hi Rafi, order NW-1')
    expect(placeholdersIn('{a} and {b} but not { c }')).toEqual(['a', 'b'])
  })
})

describe('emailBrand (what the workers give the emails)', () => {
  const settings = {
    store_name: 'Nowoll',
    store_tagline: 'always new',
    brand_color: '#111111',
    logo_url: 'https://x.supabase.co/logo.png',
  }
  it('settings + wording; the logo only when switched on', async () => {
    const { emailBrand } = await import('./email-wording.js')
    const block = {
      isActive: true,
      data: { footer: 'Hi', showLogo: true, emails: { welcome: { subject: 'W' } } },
    }
    expect(emailBrand(settings, block)).toEqual({
      name: 'Nowoll',
      tagline: 'always new',
      color: '#111111',
      footer: 'Hi',
      wording: { welcome: { subject: 'W', heading: '', intro: '' } },
      logoUrl: 'https://x.supabase.co/logo.png',
    })
    expect(emailBrand(settings, { ...block, data: { showLogo: false } })).not.toHaveProperty(
      'logoUrl',
    )
  })

  it('no block, a cleared one, or a broken one → today’s wording (never a failed email)', async () => {
    const { emailBrand } = await import('./email-wording.js')
    for (const block of [
      null,
      { isActive: false, data: { footer: 'x' } },
      { isActive: true, data: 'nonsense' },
    ])
      expect(emailBrand(settings, block)).toMatchObject({ footer: '', wording: {} })
  })
})
