import { Prisma } from '@nowoll/database'
import { SETTING_DEFAULTS } from '@nowoll/validation'
import { minimumOrderProblem, paymentRules } from './payment-rules.js'

const D = (n: number | string) => new Prisma.Decimal(n)
const rules = (
  patch: Partial<typeof SETTING_DEFAULTS> = {},
  total = 1500,
  afterDiscount = total,
  onlineConfigured = true,
) =>
  paymentRules({
    total: D(total),
    afterDiscount: D(afterDiscount),
    settings: { ...SETTING_DEFAULTS, ...patch },
    onlineConfigured,
  })
const option = (r: ReturnType<typeof paymentRules>, m: 'COD' | 'SSLCOMMERZ') =>
  r.options.find((o) => o.method === m)!

describe('paymentRules (step 38c)', () => {
  it('today’s defaults: both on, standard wording, no minimum', () => {
    const r = rules()
    expect(r.options.map((o) => [o.method, o.available, o.description])).toEqual([
      ['SSLCOMMERZ', true, 'Card, bKash, Nagad or Rocket — on SSLCommerz’s secure page'],
      ['COD', true, 'Pay the courier when your parcel arrives'],
    ])
    expect(r.minimumOrder).toBeNull()
  })

  it('switches and the admin’s descriptions', () => {
    const r = rules({ payment_cod_enabled: false, payment_online_description: 'bKash or card' })
    expect(option(r, 'COD')).toMatchObject({ available: false, problem: { code: 'COD_OFF' } })
    expect(option(r, 'SSLCOMMERZ')).toMatchObject({ available: true, description: 'bKash or card' })
    expect(option(rules({ payment_online_enabled: false }), 'SSLCOMMERZ').problem?.code).toBe(
      'ONLINE_PAYMENT_UNAVAILABLE',
    )
  })

  it('online needs the server set up (keys are developer-side) and ৳10 – ৳5,00,000', () => {
    expect(option(rules({}, 1500, 1500, false), 'SSLCOMMERZ').problem?.code).toBe(
      'ONLINE_PAYMENT_UNAVAILABLE',
    )
    expect(option(rules({}, 500_001), 'SSLCOMMERZ').problem?.code).toBe('ONLINE_PAYMENT_AMOUNT')
  })

  it('cash-on-delivery limit: the full amount to pay; exactly the limit is fine', () => {
    expect(option(rules({ cod_max_total: 10_000 }, 10_000), 'COD').available).toBe(true)
    const over = option(rules({ cod_max_total: 10_000 }, 10_000.01), 'COD')
    expect(over).toMatchObject({ available: false, problem: { code: 'COD_LIMIT' } })
    expect(over.problem!.message).toBe(
      'Cash on delivery is available for orders up to ৳10,000. Please pay online.',
    )
    expect(option(rules({ cod_max_total: 0 }, 900_000), 'COD').available).toBe(true) // 0 = no limit
  })

  it('minimum order: products after discount (not delivery); how much is missing', () => {
    const r = rules({ min_order_amount: 500 }, 560, 380) // ৳380 of products + ৳180 delivery
    expect(r.minimumOrder!.shortBy.toString()).toBe('120')
    expect(minimumOrderProblem(r)).toEqual({
      code: 'BELOW_MINIMUM_ORDER',
      message: 'The minimum order is ৳500 (products, after any discount) — add ৳120 more.',
      shortBy: '120',
    })
    expect(minimumOrderProblem(rules({ min_order_amount: 500 }, 680, 500))).toBeNull() // exactly enough
    expect(minimumOrderProblem(rules())).toBeNull()
  })
})
