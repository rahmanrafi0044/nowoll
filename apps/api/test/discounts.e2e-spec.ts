// HTTP tests for /api/v1/discounts (real nowoll_test database).
import type { NestExpressApplication } from '@nestjs/platform-express'
import { Prisma } from '@nowoll/database'
import request from 'supertest'
import { createTestApp } from './utils/app.js'
import { makeCategory, makeDiscount, makeProduct } from './utils/factories.js'
import { resetDatabase, testPrisma } from './utils/test-db.js'

const db = testPrisma()
afterAll(() => db.$disconnect())

async function bag(price = '1490') {
  const c = await makeCategory()
  const p = await makeProduct({ categoryId: c.id, basePrice: price })
  return [{ variantId: p.variants[0]!.id, quantity: 1 }]
}

describe('POST /discounts/validate (public)', () => {
  let app: NestExpressApplication
  const validate = (body: object) =>
    request(app.getHttpServer()).post('/api/v1/discounts/validate').send(body)

  // Fresh app per test: the 5/minute limit must not leak between tests.
  beforeEach(async () => {
    await resetDatabase()
    app = await createTestApp({ asAdmin: false })
  })
  afterEach(() => app.close())

  it('returns 200 with the preview, money as exact strings', async () => {
    await makeDiscount({ code: 'SAVE10' })
    const res = await validate({ code: ' save10 ', items: await bag() }).expect(200)
    expect(res.body.data).toEqual({
      code: 'SAVE10',
      type: 'PERCENTAGE',
      value: '10',
      subtotal: '1490',
      discountAmount: '149',
      subtotalAfterDiscount: '1341',
    })
  })

  it('ignores any price the browser tries to send (unknown fields are rejected)', async () => {
    await makeDiscount({ code: 'SAVE10' })
    const items = (await bag()).map((i) => ({ ...i, unitPrice: 1 }))
    await validate({ code: 'SAVE10', items }).expect(400)
    await validate({ code: 'SAVE10', items: await bag(), subtotal: 99999 }).expect(400)
  })

  it.each([
    ['unknown code', {}, 'NOPE', 'DISCOUNT_NOT_VALID'],
    ['expired code', { expiresAt: new Date('2020-01-01') }, 'OLD', 'DISCOUNT_EXPIRED'],
    ['fully used code', { usageLimit: 1, usedCount: 1 }, 'GONE', 'DISCOUNT_USED_UP'],
    ['minimum not met', { minOrderAmount: new Prisma.Decimal(5000) }, 'BIG', 'DISCOUNT_MIN_ORDER'],
  ])('422 with a specific error code: %s', async (_label, fields, code, error) => {
    if (code !== 'NOPE') await makeDiscount({ code, ...fields })
    const res = await validate({ code, items: await bag() }).expect(422)
    expect(res.body).toMatchObject({ success: false, error })
  })

  it('says which items are unavailable', async () => {
    const res = await validate({
      code: 'X',
      items: [{ variantId: '00000000-0000-0000-0000-000000000000', quantity: 1 }],
    }).expect(400)
    expect(res.body.error).toBe('ITEMS_UNAVAILABLE')
  })

  it('allows 5 checks per minute, then 429 (stops code guessing)', async () => {
    const items = await bag()
    for (let i = 0; i < 5; i++) await validate({ code: `GUESS${i}`, items }).expect(422)
    await validate({ code: 'GUESS6', items }).expect(429)
  })
})

describe('discount admin routes', () => {
  let app: NestExpressApplication
  const http = () => request(app.getHttpServer())

  beforeAll(async () => {
    app = await createTestApp({ asAdmin: true })
  })
  afterAll(() => app.close())
  beforeEach(() => resetDatabase())

  it('create → list → update → archive', async () => {
    const created = await http()
      .post('/api/v1/discounts')
      .send({
        code: 'eid26',
        type: 'PERCENTAGE',
        value: 20,
        maxDiscountAmount: 500,
        expiresAt: '2026-12-31T18:00:00Z',
      })
      .expect(201)
    expect(created.body.data).toMatchObject({
      code: 'EID26',
      value: '20',
      maxDiscountAmount: '500',
    })

    const list = await http().get('/api/v1/discounts').expect(200)
    expect(list.body.data.items[0]).toMatchObject({
      code: 'EID26',
      usedCount: 0,
      totalDiscounted: '0',
    })

    await http().patch(`/api/v1/discounts/${created.body.data.id}`).send({ value: 25 }).expect(200)
    await http().delete(`/api/v1/discounts/${created.body.data.id}`).expect(200)
    expect((await http().get('/api/v1/discounts')).body.data.total).toBe(0)
  })

  it.each([
    ['bad code characters', { code: 'EID 26!', type: 'PERCENTAGE', value: 10 }],
    ['unknown type', { code: 'X1Y', type: 'FREE_SHIPPING', value: 10 }],
    ['negative value', { code: 'X1Y', type: 'FIXED_AMOUNT', value: -5 }],
    ['zero usage limit', { code: 'X1Y', type: 'PERCENTAGE', value: 10, usageLimit: 0 }],
    ['not a date', { code: 'X1Y', type: 'PERCENTAGE', value: 10, expiresAt: 'tomorrow' }],
  ])('rejects %s', async (_label, body) => {
    await http().post('/api/v1/discounts').send(body).expect(400)
  })
})

describe('discount admin routes — without admin access', () => {
  let app: NestExpressApplication
  beforeAll(async () => {
    app = await createTestApp({ asAdmin: false })
  })
  afterAll(() => app.close())

  it.each([
    ['GET', '/api/v1/discounts'],
    ['POST', '/api/v1/discounts'],
    ['PATCH', '/api/v1/discounts/00000000-0000-0000-0000-000000000000'],
    ['DELETE', '/api/v1/discounts/00000000-0000-0000-0000-000000000000'],
  ])('refuses %s %s with 401', async (method, url) => {
    const agent = request(app.getHttpServer())
    const req =
      method === 'GET'
        ? agent.get(url)
        : method === 'POST'
          ? agent.post(url)
          : method === 'PATCH'
            ? agent.patch(url)
            : agent.delete(url)
    await req.send({}).expect(401)
  })
})
