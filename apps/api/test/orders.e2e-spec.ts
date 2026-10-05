// HTTP tests for POST /api/v1/orders (real nowoll_test DB).
import { randomUUID } from 'node:crypto'
import type { NestExpressApplication } from '@nestjs/platform-express'
import request from 'supertest'
import { createTestApp } from './utils/app.js'
import { makeCategory, makeProduct, seedShippingZones } from './utils/factories.js'
import { resetDatabase, testPrisma } from './utils/test-db.js'

const db = testPrisma()
afterAll(() => db.$disconnect())

async function body(overrides: object = {}) {
  const c = await makeCategory()
  const p = await makeProduct({
    categoryId: c.id,
    basePrice: '1490',
    variants: [{ size: 'M', color: 'Blue', stock: 20 }],
  })
  return {
    items: [{ variantId: p.variants[0]!.id, quantity: 1 }],
    contact: { fullName: '  Rafi Rahman ', email: ' Rafi@Example.com', phone: '017 1234-5678' },
    address: {
      division: 'Dhaka',
      district: 'Dhaka',
      area: 'Dhanmondi',
      addressLine1: 'House 12, Road 5',
      postalCode: '',
    },
    paymentMethod: 'COD',
    expectedTotal: '1550',
    ...overrides,
  }
}

describe('POST /orders', () => {
  let app: NestExpressApplication
  const place = (b: object, key: string | null = randomUUID()) => {
    const req = request(app.getHttpServer()).post('/api/v1/orders')
    return (key ? req.set('Idempotency-Key', key) : req).send(b)
  }

  beforeEach(async () => {
    await resetDatabase()
    await seedShippingZones()
    app = await createTestApp({ asAdmin: false }) // fresh per test: the 10/min limit must not leak
  })
  afterEach(() => app.close())

  it('201 with the order number; contact details normalized', async () => {
    const res = await place(await body()).expect(201)
    expect(res.body.data).toMatchObject({
      displayNumber: 'NW-10001',
      status: 'PENDING',
      paymentMethod: 'COD',
      total: '1550',
      nextAction: 'NONE',
    })
    const order = await db.order.findFirstOrThrow()
    expect(order).toMatchObject({
      customerName: 'Rafi Rahman',
      email: 'rafi@example.com',
      phone: '+8801712345678',
      shippingPostalCode: null,
    })
  })

  it('requires a valid Idempotency-Key header', async () => {
    const b = await body()
    expect((await place(b, null).expect(400)).body.message).toMatch(/Idempotency-Key/)
    await place(b, 'not-a-uuid').expect(400)
    expect(await db.order.count()).toBe(0)
  })

  it.each([
    ['a landline number', { contact: { fullName: 'A', email: 'a@b.com', phone: '029876543' } }],
    [
      'an unknown district',
      { address: { division: 'Dhaka', district: 'Chittagong', addressLine1: 'x' } },
    ],
    [
      'a price from the browser',
      { items: [{ variantId: randomUUID(), quantity: 1, unitPrice: 1 }] },
    ],
    ['an unknown payment method', { paymentMethod: 'BKASH_DIRECT' }],
    ['a malformed expected total', { expectedTotal: '1,550' }],
  ])('rejects %s', async (_label, overrides) => {
    await place(await body(overrides)).expect(400)
    expect(await db.order.count()).toBe(0)
  })

  it('409 PRICE_CHANGED with the new total', async () => {
    const res = await place(await body({ expectedTotal: '1490' })).expect(409)
    expect(res.body).toMatchObject({
      error: 'PRICE_CHANGED',
      message: expect.stringContaining('৳1550'),
    })
  })

  it('allows 10 orders per minute per visitor, then 429', async () => {
    const b = await body()
    for (let i = 0; i < 10; i++) await place(b).expect(201)
    await place(b).expect(429)
  })

  it('browsers on the storefront may send the Idempotency-Key header (CORS)', async () => {
    const res = await request(app.getHttpServer())
      .options('/api/v1/orders')
      .set('Origin', 'http://localhost:3000')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type,idempotency-key')
      .expect(204)
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000')
    expect(res.headers['access-control-allow-headers']).toMatch(/idempotency-key/i)
  })
})
