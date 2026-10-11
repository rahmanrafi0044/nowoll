import { describe, expect, it } from 'vitest'
import { productInfoLines, productInfoSchema } from './product-info.js'

const zones = [
  {
    name: 'Outside Dhaka',
    fee: '120',
    freeShippingThreshold: null,
    estimatedDaysMin: 3,
    estimatedDaysMax: 5,
    isDefault: true,
  },
  {
    name: 'Inside Dhaka',
    fee: '60',
    freeShippingThreshold: '3000',
    estimatedDaysMin: 1,
    estimatedDaysMax: 1,
    isDefault: false,
  },
]
const settings = { return_window_days: 7, payment_cod_enabled: true, cod_max_total: 0 }

describe('product info box (step 38d)', () => {
  it('defaults: all three automatic lines on, nothing of your own', () => {
    expect(productInfoSchema.parse({})).toEqual({
      title: 'Delivery and returns',
      showDelivery: true,
      showReturns: true,
      showCod: true,
      lines: [],
      link: null,
    })
  })

  it('automatic lines from the live settings, in order; your own lines last', () => {
    const info = productInfoSchema.parse({ lines: ['100% cotton, made in Bangladesh'] })
    expect(productInfoLines(info, zones, settings).map((l) => l.text)).toEqual([
      'Inside Dhaka: ৳60 (free over ৳3,000) · 1 day',
      'Outside Dhaka: ৳120 · 3–5 days',
      'Easy returns within 7 days of delivery',
      'Cash on delivery available',
      '100% cotton, made in Bangladesh',
    ])
  })

  it('follows the rules: free zone, returns off, a COD limit, COD switched off', () => {
    const info = productInfoSchema.parse({})
    const free = [{ ...zones[1]!, fee: '0', freeShippingThreshold: null }]
    expect(productInfoLines(info, free, settings)[0]!.text).toBe(
      'Inside Dhaka: free delivery · 1 day',
    )
    const off = productInfoLines(info, [], {
      return_window_days: 0,
      payment_cod_enabled: true,
      cod_max_total: 10_000,
    })
    expect(off.map((l) => l.text)).toEqual([
      'Returns aren’t accepted on this shop',
      'Cash on delivery available (orders up to ৳10,000)',
    ])
    expect(
      productInfoLines(info, [], { ...settings, payment_cod_enabled: false }).some(
        (l) => l.kind === 'cod',
      ),
    ).toBe(false)
  })

  it('each automatic line can be switched off', () => {
    const info = productInfoSchema.parse({
      showDelivery: false,
      showReturns: false,
      showCod: false,
      lines: ['Hi'],
    })
    expect(productInfoLines(info, zones, settings)).toEqual([{ kind: 'custom', text: 'Hi' }])
  })

  it('refused: javascript: links, 5 lines, empty lines', () => {
    const ok = (v: object) => productInfoSchema.safeParse(v).success
    expect(ok({ link: { label: 'Returns', href: '/return-policy' } })).toBe(true)
    expect(ok({ link: { label: 'x', href: 'javascript:alert(1)' } })).toBe(false)
    expect(ok({ lines: ['a', 'b', 'c', 'd', 'e'] })).toBe(false)
    expect(ok({ lines: ['  '] })).toBe(false)
  })
})
