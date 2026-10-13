import { describe, expect, it } from 'vitest'
import {
  BRAND_PRESETS,
  brandHover,
  contrastWithWhite,
  isLinkOn,
  MIN_CONTRAST,
  localPhone,
  publicSettings,
  readSettings,
  SETTING_DEFAULTS,
  SETTINGS_SCHEMA,
  whatsappLink,
} from './settings.js'

const ok = (patch: object) => SETTINGS_SCHEMA.partial().strict().safeParse(patch)

describe('store settings', () => {
  it('contact details are cleaned: email lowercased, phones as +880…, empty allowed', () => {
    expect(
      SETTINGS_SCHEMA.partial().parse({
        store_email: '  Hello@Nowoll.com ',
        store_phone: '01712-345678',
        store_whatsapp: '',
        store_name: ' Nowoll ',
      }),
    ).toEqual({
      store_email: 'hello@nowoll.com',
      store_phone: '+8801712345678',
      store_whatsapp: '',
      store_name: 'Nowoll',
    })
    expect(ok({ store_phone: '12345' }).success).toBe(false)
    expect(ok({ store_email: 'nope' }).success).toBe(false)
    expect(ok({ store_name: '  ' }).success).toBe(false)
  })

  it('social links: https on that site only — look-alikes and http refused', () => {
    expect(ok({ social_facebook: 'https://www.facebook.com/nowoll' }).success).toBe(true)
    expect(ok({ social_facebook: 'https://m.facebook.com/nowoll' }).success).toBe(true)
    expect(ok({ social_youtube: 'https://youtu.be/abc' }).success).toBe(true)
    for (const bad of [
      'http://facebook.com/nowoll',
      'https://facebook.com.evil.example/nowoll',
      'https://evilfacebook.com/nowoll',
      'javascript:alert(1)',
      'facebook.com/nowoll',
    ])
      expect(ok({ social_facebook: bad }).success).toBe(false)
    expect(ok({ social_instagram: 'https://www.facebook.com/x' }).success).toBe(false)
    expect(isLinkOn('https://WWW.TikTok.com/@nowoll', ['tiktok.com'])).toBe(true)
  })

  it('numbers and choices within their limits', () => {
    expect(ok({ vat_rate: 7.5 }).success).toBe(true)
    expect(ok({ vat_rate: 7.555 }).success).toBe(false)
    expect(ok({ vat_rate: 101 }).success).toBe(false)
    expect(ok({ return_window_days: 0 }).success).toBe(true) // returns off
    expect(ok({ return_window_days: 91 }).success).toBe(false)
    expect(ok({ return_window_days: 1.5 }).success).toBe(false)
    expect(ok({ payment_timeout_minutes: 4 }).success).toBe(false)
    expect(ok({ low_stock_threshold: -1 }).success).toBe(false)
    expect(ok({ shop_page_size: 36 }).success).toBe(true)
    expect(ok({ shop_page_size: 30 }).success).toBe(false)
    expect(ok({ shop_default_sort: 'price_asc' }).success).toBe(true)
    expect(ok({ shop_default_sort: 'relevance' }).success).toBe(false)
    expect(ok({ thank_you_message: 'x'.repeat(301) }).success).toBe(false)
    expect(ok({ currency: 'USD' }).success).toBe(false) // not a setting (developer-side)
  })

  it('reading: each missing or broken value falls back on its own', () => {
    const s = readSettings([
      { key: 'store_name', value: 'My Shop' },
      { key: 'vat_rate', value: 'lots' },
      { key: 'shop_page_size', value: 36 },
      { key: 'store_email', value: '' },
      { key: 'unknown', value: 1 },
    ])
    expect(s).toEqual({ ...SETTING_DEFAULTS, store_name: 'My Shop', shop_page_size: 36 })
  })

  it('the public subset never includes the admin email or internal limits', () => {
    const pub = publicSettings({ ...SETTING_DEFAULTS, admin_notification_email: 'me@x.com' })
    expect(pub).not.toHaveProperty('admin_notification_email')
    expect(pub).not.toHaveProperty('vat_rate')
    expect(pub).not.toHaveProperty('payment_timeout_minutes')
    expect(pub).not.toHaveProperty('low_stock_threshold')
    expect(pub).toHaveProperty('store_name', 'Nowoll')
  })

  it('phone helpers', () => {
    expect(localPhone('+8801712345678')).toBe('01712345678')
    expect(whatsappLink('+8801712345678')).toBe('https://wa.me/8801712345678')
  })
})

describe('the look (step 38, part 2)', () => {
  it('brand colour: a #rrggbb readable with white text; light colours refused', () => {
    expect(SETTINGS_SCHEMA.shape.brand_color.parse(' #1E3A8A ')).toBe('#1e3a8a')
    for (const bad of [
      '#ffff00',
      '#fbcfe8',
      '#ffffff',
      'navy',
      '#123',
      'red;}body{display:none',
      '#1e3a8a;',
    ])
      expect(SETTINGS_SCHEMA.shape.brand_color.safeParse(bad).success).toBe(false)
    expect(contrastWithWhite('#111111')).toBeGreaterThan(18)
    expect(contrastWithWhite('#ffffff')).toBeCloseTo(1)
  })

  it('every ready-made colour passes the contrast check', () => {
    for (const p of BRAND_PRESETS)
      expect(contrastWithWhite(p.color)).toBeGreaterThanOrEqual(MIN_CONTRAST)
  })

  it('hover shade: 18% towards white', () => {
    expect(brandHover('#000000')).toBe('#2e2e2e')
    expect(brandHover('#111111')).toBe('#3c3c3c')
  })

  it('pictures: empty or https only; fonts from the list', () => {
    const shape = SETTINGS_SCHEMA.shape
    expect(shape.logo_url.safeParse('').success).toBe(true)
    expect(shape.logo_url.safeParse('https://x.supabase.co/a.png').success).toBe(true)
    for (const bad of [
      'http://x.com/a.png',
      'javascript:alert(1)',
      'data:image/svg+xml,<svg/>',
      'a.png',
    ])
      expect(shape.logo_url.safeParse(bad).success).toBe(false)
    expect(shape.font.safeParse('poppins').success).toBe(true)
    expect(shape.font.safeParse('comic-sans').success).toBe(false)
  })

  it('the look is public (the shop needs it)', () => {
    const pub = publicSettings(SETTING_DEFAULTS)
    expect(pub).toMatchObject({ brand_color: '#111111', font: 'system', logo_url: '' })
  })
})

describe('payments (step 38c)', () => {
  const ok = (patch: object) => SETTINGS_SCHEMA.partial().strict().safeParse(patch).success
  it('switches, descriptions, limits (0 = none)', () => {
    expect(
      ok({ payment_cod_enabled: false, payment_online_description: 'Card, bKash, Nagad' }),
    ).toBe(true)
    expect(ok({ cod_max_total: 0 })).toBe(true)
    expect(ok({ cod_max_total: 10_000 })).toBe(true)
    expect(ok({ cod_max_total: 50 })).toBe(false)
    expect(ok({ cod_max_total: 1_000_001 })).toBe(false)
    expect(ok({ min_order_amount: 500 })).toBe(true)
    expect(ok({ min_order_amount: 0.5 })).toBe(false)
    expect(ok({ min_order_amount: 100_001 })).toBe(false)
    expect(ok({ min_order_amount: 99.999 })).toBe(false)
    expect(ok({ payment_cod_description: 'x'.repeat(121) })).toBe(false)
    expect(ok({ payment_cod_enabled: 'no' })).toBe(false)
  })

  it('only the COD switch and limit are public (the product info box shows them, step 38d)', () => {
    const pub = publicSettings(SETTING_DEFAULTS)
    expect(pub).toHaveProperty('cod_max_total', 0)
    expect(pub).toHaveProperty('payment_cod_enabled', true)
    expect(pub).not.toHaveProperty('min_order_amount')
    expect(pub).not.toHaveProperty('payment_online_enabled')
  })
})

describe('marketing and tracking IDs (step 39a)', () => {
  const parse = (patch: object) => SETTINGS_SCHEMA.partial().strict().safeParse(patch)
  it('accepts each official ID format (cleaned to capitals), or empty', () => {
    expect(
      parse({
        ga4_measurement_id: ' g-ab12cd34ef ',
        gtm_container_id: 'gtm-ab12cd3',
        meta_pixel_id: '123456789012345',
        meta_domain_verification: 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5',
      }).data,
    ).toEqual({
      ga4_measurement_id: 'G-AB12CD34EF',
      gtm_container_id: 'GTM-AB12CD3',
      meta_pixel_id: '123456789012345',
      meta_domain_verification: 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5',
    })
    expect(parse({ ga4_measurement_id: '', gtm_container_id: '', meta_pixel_id: '' }).success).toBe(
      true,
    )
  })

  it('refuses anything that is not just an ID — no pasted scripts (CLAUDE.md Rule 9)', () => {
    expect(parse({ ga4_measurement_id: 'UA-12345-1' }).success).toBe(false) // old Universal Analytics
    expect(parse({ ga4_measurement_id: 'GTM-AB12CD3' }).success).toBe(false) // wrong box
    expect(parse({ gtm_container_id: 'G-AB12CD34EF' }).success).toBe(false)
    expect(
      parse({ ga4_measurement_id: "<script>gtag('config','G-AB12CD34EF')</script>" }).success,
    ).toBe(false)
    expect(parse({ meta_pixel_id: '12345' }).success).toBe(false)
    expect(parse({ meta_pixel_id: "fbq('init','123456789012345')" }).success).toBe(false)
    expect(parse({ meta_domain_verification: 'abc"><script>' }).success).toBe(false)
    expect(parse({ meta_domain_verification: 'short' }).success).toBe(false)
  })

  it('the whole Meta verification tag can be pasted — only the code is kept', () => {
    expect(
      parse({
        meta_domain_verification:
          '<meta name="facebook-domain-verification" content="a1b2c3d4e5f6g7h8i9j0" />',
      }).data,
    ).toEqual({ meta_domain_verification: 'a1b2c3d4e5f6g7h8i9j0' })
    expect(
      parse({ meta_domain_verification: '<meta content="x<script>alert(1)</script>" />' }).success,
    ).toBe(false)
  })

  it('the IDs are public (every visitor receives them in the scripts) and empty by default', () => {
    const pub = publicSettings(readSettings([{ key: 'meta_pixel_id', value: '123456789012345' }]))
    expect(pub).toMatchObject({
      meta_pixel_id: '123456789012345',
      ga4_measurement_id: '',
      gtm_container_id: '',
      meta_domain_verification: '',
    })
  })

  it('a broken stored ID falls back to empty (no tracking) instead of reaching the page', () => {
    expect(readSettings([{ key: 'gtm_container_id', value: '"><script>' }]).gtm_container_id).toBe(
      '',
    )
  })
})

describe('server-side events switch (step 39b)', () => {
  it('a plain on/off, off by default, never public', () => {
    expect(SETTING_DEFAULTS.meta_capi_enabled).toBe(false)
    expect(SETTINGS_SCHEMA.partial().strict().safeParse({ meta_capi_enabled: true }).success).toBe(
      true,
    )
    expect(SETTINGS_SCHEMA.partial().strict().safeParse({ meta_capi_enabled: 'yes' }).success).toBe(
      false,
    )
    expect(publicSettings(SETTING_DEFAULTS)).not.toHaveProperty('meta_capi_enabled')
    // Step 39c: the catalogue feed switch — the same rules.
    expect(SETTING_DEFAULTS.meta_catalog_enabled).toBe(false)
    expect(publicSettings(SETTING_DEFAULTS)).not.toHaveProperty('meta_catalog_enabled')
  })
})

describe('newsletter (step 42)', () => {
  const parse = (patch: object) => SETTINGS_SCHEMA.partial().strict().safeParse(patch)
  it('footer form on, checkout box off and Resend copy off by default', () => {
    expect(SETTING_DEFAULTS).toMatchObject({
      newsletter_footer_enabled: true,
      newsletter_checkout_optin: false,
      newsletter_resend_enabled: false,
      newsletter_resend_segment_id: '',
    })
  })

  it('the segment id is a Resend id (cleaned), or empty', () => {
    expect(
      parse({ newsletter_resend_segment_id: ' 78261EEA-8F8B-4381-83C6-79FA7120F1CF ' }).data,
    ).toEqual({ newsletter_resend_segment_id: '78261eea-8f8b-4381-83c6-79fa7120f1cf' })
    expect(parse({ newsletter_resend_segment_id: 'Newsletter' }).success).toBe(false)
    expect(parse({ newsletter_resend_segment_id: '' }).success).toBe(true)
  })

  it('the shop sees where to show sign-up, never the Resend settings', () => {
    const pub = publicSettings(SETTING_DEFAULTS)
    expect(pub).toMatchObject({ newsletter_footer_enabled: true, newsletter_checkout_optin: false })
    expect(pub).not.toHaveProperty('newsletter_resend_enabled')
    expect(pub).not.toHaveProperty('newsletter_resend_segment_id')
  })
})
