import { Prisma } from '@nowoll/database'
import { computeTotals } from './totals.js'

const D = (v: string | number) => new Prisma.Decimal(v)
const run = (
  o: Partial<{
    subtotal: string
    discount: string
    fee: string
    threshold: string | null
    vat: number
  }>,
) => {
  const t = computeTotals({
    subtotal: D(o.subtotal ?? '1490'),
    discount: D(o.discount ?? '0'),
    shippingFee: D(o.fee ?? '60'),
    freeShippingThreshold: o.threshold ? D(o.threshold) : null,
    vatRate: o.vat ?? 0,
  })
  return Object.fromEntries(
    Object.entries(t).map(([k, v]) => [k, typeof v === 'boolean' ? v : v.toString()]),
  )
}

describe('computeTotals', () => {
  it('adds shipping; no VAT at 0%', () => {
    expect(run({})).toMatchObject({
      afterDiscount: '1490',
      shippingFee: '60',
      vatAmount: '0',
      total: '1550',
    })
  })

  it('discount reduces products only; shipping stays', () => {
    expect(run({ discount: '149' })).toMatchObject({
      afterDiscount: '1341',
      shippingFee: '60',
      total: '1401',
    })
  })

  it('VAT is on (products − discount), not on shipping, rounded to the poisha', () => {
    // 7.5% of 1341 = 100.575 → 100.58
    expect(run({ discount: '149', vat: 7.5 })).toMatchObject({
      vatAmount: '100.58',
      total: '1501.58',
    })
  })

  it('free shipping when the DISCOUNTED subtotal reaches the threshold (decision #2)', () => {
    expect(run({ subtotal: '2000', threshold: '2000' })).toMatchObject({
      freeShipping: true,
      shippingFee: '0',
      total: '2000',
    })
    // a discount that takes it below the threshold means shipping is charged
    expect(run({ subtotal: '2000', discount: '200', threshold: '2000' })).toMatchObject({
      freeShipping: false,
      shippingFee: '60',
      total: '1860',
    })
  })

  it('a discount can never exceed the subtotal', () => {
    expect(run({ subtotal: '100', discount: '500' })).toMatchObject({
      discount: '100',
      afterDiscount: '0',
      total: '60',
    })
  })

  it('is exact: total always equals the sum of its parts', () => {
    const t = computeTotals({
      subtotal: D('1341.5'),
      discount: D('134'),
      shippingFee: D('120'),
      freeShippingThreshold: null,
      vatRate: 15,
    })
    expect(t.total.equals(t.subtotal.minus(t.discount).plus(t.shippingFee).plus(t.vatAmount))).toBe(
      true,
    )
  })
})
