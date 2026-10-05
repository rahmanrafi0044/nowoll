import { Prisma } from '@nowoll/database'
import { type DiscountRules, discountAmount, normalizeCode, refusalFor } from './discount-rules.js'

const D = (v: string | number) => new Prisma.Decimal(v)
const NOW = new Date('2026-10-05T12:00:00Z')
const rules = (overrides: Partial<DiscountRules> = {}): DiscountRules => ({
  type: 'PERCENTAGE',
  value: D(10),
  minOrderAmount: null,
  maxDiscountAmount: null,
  usageLimit: null,
  usedCount: 0,
  startsAt: null,
  expiresAt: null,
  isActive: true,
  deletedAt: null,
  ...overrides,
})

describe('normalizeCode', () => {
  it('trims and upper-cases', () => {
    expect(normalizeCode('  summer10 ')).toBe('SUMMER10')
  })
})

describe('discountAmount', () => {
  it.each([
    ['10% of ৳1,490 → ৳149', rules(), '1490', '149'],
    ['10% of ৳1,341.50 rounds DOWN to whole taka → ৳134', rules(), '1341.5', '134'],
    ['15% of ৳999 → ৳149 (149.85 rounded down)', rules({ value: D(15) }), '999', '149'],
    [
      'percentage capped by maxDiscountAmount',
      rules({ value: D(50), maxDiscountAmount: D(300) }),
      '2000',
      '300',
    ],
    [
      'fixed amount as entered',
      rules({ type: 'FIXED_AMOUNT', value: D('200.5') }),
      '1490',
      '200.5',
    ],
    [
      'fixed amount never exceeds the subtotal',
      rules({ type: 'FIXED_AMOUNT', value: D(500) }),
      '300',
      '300',
    ],
    ['100% never exceeds the subtotal', rules({ value: D(100) }), '1490', '1490'],
  ])('%s', (_label, r, subtotal, expected) => {
    expect(discountAmount(r, D(subtotal)).toString()).toBe(expected)
  })

  it('uses exact decimal maths (no floating-point drift)', () => {
    // 0.1 + 0.2 style problem: 10% of 0.3 should not become 0.030000000000000002
    expect(
      discountAmount(rules({ type: 'FIXED_AMOUNT', value: D('0.3') }), D('0.3')).toString(),
    ).toBe('0.3')
  })
})

describe('refusalFor', () => {
  const subtotal = D(1000)

  it('accepts a valid code', () => {
    expect(refusalFor(rules(), subtotal, NOW)).toBeNull()
  })

  it.each([
    ['unknown', null],
    ['inactive', rules({ isActive: false })],
    ['archived', rules({ deletedAt: new Date() })],
    ['not started yet', rules({ startsAt: new Date('2026-10-06T00:00:00Z') })],
  ])('gives the SAME generic answer for a code that is %s (no promo discovery)', (_label, r) => {
    expect(refusalFor(r, subtotal, NOW)).toEqual({
      code: 'DISCOUNT_NOT_VALID',
      message: "This code isn't valid.",
    })
  })

  it('reports expiry (the end time itself counts as expired)', () => {
    expect(refusalFor(rules({ expiresAt: NOW }), subtotal, NOW)?.code).toBe('DISCOUNT_EXPIRED')
    expect(refusalFor(rules({ expiresAt: new Date(NOW.getTime() + 1) }), subtotal, NOW)).toBeNull()
  })

  it('reports a fully used code', () => {
    expect(refusalFor(rules({ usageLimit: 100, usedCount: 100 }), subtotal, NOW)?.code).toBe(
      'DISCOUNT_USED_UP',
    )
    expect(refusalFor(rules({ usageLimit: 100, usedCount: 99 }), subtotal, NOW)).toBeNull()
  })

  it('says how much more to add for a minimum order', () => {
    const r = refusalFor(rules({ minOrderAmount: D(1200) }), D(990), NOW)
    expect(r).toMatchObject({
      code: 'DISCOUNT_MIN_ORDER',
      message: 'Add ৳210 more to use this code (minimum order ৳1,200).',
    })
    expect(refusalFor(rules({ minOrderAmount: D(1000) }), D(1000), NOW)).toBeNull() // exactly the minimum is fine
  })
})
