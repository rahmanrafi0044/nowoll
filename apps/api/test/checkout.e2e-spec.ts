// HTTP tests for GET /shipping/rates and POST /checkout/quote (real nowoll_test DB).
import type { NestExpressApplication } from '@nestjs/platform-express'
import { Prisma } from '@nowoll/database'
import request from 'supertest'
import { createTestApp } from './utils/app.js'
import { makeCategory, makeDiscount, makeProduct } from './utils/factories.js'
import { resetDatabase, testPrisma } from './utils/test-db.js'

const db = testPrisma()
const D = (v: string | number) => new Prisma.Decimal(v)
afterAll(() => db.$disconnect())

async function seedZones(dhakaThreshold: string | null = null) {
  await db.shippingZone.createMany({
    data: [
      {
        code: 'DHAKA',
        name: 'Inside Dhaka',
        districts: ['Dhaka'],
        fee: D(60),
        freeShippingThreshold: dhakaThreshold ? D(dhakaThreshold) : null,
        estimatedDaysMin: 1,
        estimatedDaysMax: 3,
      },
      {
        code: 'OUTSIDE_DHAKA',
        name: 'Outside Dhaka',
        districts: [],
        isDefault: true,
        fee: D(120),
        estimatedDaysMin: 3,
        estimatedDaysMax: 5,
      },
    ],
  })
}

async function bag(price = '1490', quantity = 1) {
  const c = await makeCategory()
  const p = await makeProduct({ categoryId: c.id, basePrice: price })
  return [{ variantId: p.variants[0]!.id, quantity }]
}

describe('checkout API', () => {
  let app: NestExpressApplication
  const quote = (body: object) =>
    request(app.getHttpServer()).post('/api/v1/checkout/quote').send(body)

  // Fresh app per test so the 20/min limit doesn't leak between tests.
  beforeEach(async () => {
    await resetDatabase()
    app = await createTestApp({ asAdmin: false })
  })
  afterEach(() => app.close())

  it('GET /shipping/rates lists active zones', async () => {
    await seedZones()
    const res = await request(app.getHttpServer()).get('/api/v1/shipping/rates').expect(200)
    expect(res.body.data.map((z: { code: string; fee: string }) => [z.code, z.fee])).toEqual([
      ['DHAKA', '60'],
      ['OUTSIDE_DHAKA', '120'],
    ])
  })

  it('without a district: products and discount only, shipping not known yet', async () => {
    await seedZones()
    const res = await quote({ items: await bag() }).expect(200)
    expect(res.body.data).toMatchObject({
      shipping: null,
      totals: { subtotal: '1490', shippingFee: '0', total: '1490' },
    })
  })

  it.each([
    ['Dhaka', 'DHAKA', '60', '1550'],
    ['Gazipur', 'OUTSIDE_DHAKA', '120', '1610'], // not listed in the Dhaka zone → catch-all
    ['Sylhet', 'OUTSIDE_DHAKA', '120', '1610'],
  ])('district %s → zone %s, fee %s, total %s', async (district, zone, fee, total) => {
    await seedZones()
    const res = await quote({ items: await bag(), district }).expect(200)
    expect(res.body.data.shipping.code).toBe(zone)
    expect(res.body.data.totals).toMatchObject({ shippingFee: fee, total })
  })

  it('applies the discount, free shipping after discount, and VAT from settings', async () => {
    await seedZones('2000')
    await db.setting.create({ data: { key: 'vat_rate', value: 7.5 } })
    await makeDiscount({ code: 'SAVE10' })
    // ৳2,400 − 10% (240) = 2,160 ≥ 2,000 → free shipping; VAT 7.5% of 2,160 = 162
    const res = await quote({
      items: await bag('1200', 2),
      district: 'Dhaka',
      discountCode: 'save10',
    }).expect(200)
    expect(res.body.data.discount).toEqual({ code: 'SAVE10', amount: '240' })
    expect(res.body.data.totals).toMatchObject({
      subtotal: '2400',
      discount: '240',
      afterDiscount: '2160',
      freeShipping: true,
      shippingFee: '0',
      vatRate: '7.5',
      vatAmount: '162',
      total: '2322',
    })
  })

  it("a code that can't be used is reported, but the quote still works", async () => {
    await seedZones()
    await makeDiscount({ code: 'BIG', minOrderAmount: D(5000) })
    const res = await quote({ items: await bag(), district: 'Dhaka', discountCode: 'BIG' }).expect(
      200,
    )
    expect(res.body.data.discount).toBeNull()
    expect(res.body.data.discountProblem).toMatchObject({ code: 'DISCOUNT_MIN_ORDER' })
    expect(res.body.data.totals.total).toBe('1550')
  })

  it('refuses unavailable items and unknown districts', async () => {
    await seedZones()
    const gone = await quote({
      items: [{ variantId: '00000000-0000-0000-0000-000000000000', quantity: 1 }],
      district: 'Dhaka',
    }).expect(400)
    expect(gone.body.error).toBe('ITEMS_UNAVAILABLE')
    await quote({ items: await bag(), district: 'Chittagong' }).expect(400) // old spelling is not a district name
    await quote({ items: [] }).expect(400)
  })

  it('503 (not a customer error) if no default delivery zone is set up', async () => {
    const res = await quote({ items: await bag(), district: 'Sylhet' }).expect(503)
    expect(res.body.message).toMatch(/not available right now/)
  })

  it('allows 20 quotes per minute (codes are evaluated here too), then 429', async () => {
    await seedZones()
    const items = await bag()
    for (let i = 0; i < 20; i++) await quote({ items, discountCode: `GUESS${i}` }).expect(200)
    await quote({ items }).expect(429)
  })
})
