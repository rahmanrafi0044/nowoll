// Step 34: discount codes in the admin panel — status, usage numbers, the
// orders that used a code. (The code rules themselves are tested in
// discounts.e2e-spec.ts and src/discounts.)
import { randomUUID } from 'node:crypto'
import type { NestExpressApplication } from '@nestjs/platform-express'
import { Prisma } from '@nowoll/database'
import request from 'supertest'
import { discountStatus, DiscountsService } from '../src/discounts/discounts.service.js'
import { createTestApp } from './utils/app.js'
import { makeCategory, makeDiscount, makeProduct, seedShippingZones } from './utils/factories.js'
import { resetDatabase, testPrisma } from './utils/test-db.js'

const db = testPrisma()
afterAll(() => db.$disconnect())

const NOW = new Date('2026-10-08T06:00:00Z')
const DAY = 86_400_000

describe('discountStatus — one status, decided off → expired → used up → scheduled → active', () => {
  const code = (over: object = {}) => ({
    isActive: true,
    startsAt: null,
    expiresAt: null,
    usageLimit: null,
    usedCount: 0,
    ...over,
  })
  it.each([
    ['ACTIVE', {}],
    [
      'ACTIVE',
      { startsAt: new Date(NOW.getTime() - DAY), expiresAt: new Date(NOW.getTime() + DAY) },
    ],
    ['SCHEDULED', { startsAt: new Date(NOW.getTime() + DAY) }],
    ['EXPIRED', { expiresAt: NOW }], // the end instant itself is already over
    ['USED_UP', { usageLimit: 3, usedCount: 3 }],
    ['ACTIVE', { usageLimit: 3, usedCount: 2 }],
    ['OFF', { isActive: false, expiresAt: new Date(NOW.getTime() - DAY) }], // off wins
    ['EXPIRED', { expiresAt: new Date(NOW.getTime() - DAY), usageLimit: 1, usedCount: 1 }], // expired beats used up
    ['USED_UP', { startsAt: new Date(NOW.getTime() + DAY), usageLimit: 1, usedCount: 1 }], // used up beats scheduled
  ])('%s for %o', (expected, over) => {
    expect(discountStatus(code(over), NOW)).toBe(expected)
  })
})

describe('admin discounts (step 34)', () => {
  let app: NestExpressApplication
  const http = () => request(app.getHttpServer())

  beforeAll(async () => {
    app = await createTestApp({ asAdmin: true })
  })
  afterAll(() => app.close())
  beforeEach(async () => {
    await resetDatabase()
    await seedShippingZones()
  })

  it('the list filter matches the status shown, for every status', async () => {
    const day = (n: number) => new Date(Date.now() + n * DAY)
    const made = {
      ACTIVE: await makeDiscount({ code: 'ACTIVE1' }),
      SCHEDULED: await makeDiscount({ code: 'LATER1', startsAt: day(2) }),
      EXPIRED: await makeDiscount({ code: 'OLD1', expiresAt: day(-1) }),
      USED_UP: await makeDiscount({ code: 'GONE1', usageLimit: 2, usedCount: 2 }),
      OFF: await makeDiscount({ code: 'OFF1', isActive: false }),
    }
    await makeDiscount({ code: 'ARCHIVED1', deletedAt: new Date() }) // never listed

    const all = (await http().get('/api/v1/discounts').expect(200)).body.data.items
    expect(all).toHaveLength(5)
    for (const [status, c] of Object.entries(made)) {
      const items = (await http().get(`/api/v1/discounts?status=${status}`).expect(200)).body.data
        .items
      expect(items.map((i: { id: string }) => i.id)).toEqual([c.id])
      expect(items[0].status).toBe(status)
    }
    await http().get('/api/v1/discounts?status=SOMETIMES').expect(400)
  })

  it('usage numbers: discount given counts held uses; sales count confirmed-or-later orders only', async () => {
    const code = await makeDiscount({
      code: 'TEN',
      type: 'PERCENTAGE',
      value: new Prisma.Decimal(10),
    })
    const c = await makeCategory()
    const p = await makeProduct({
      categoryId: c.id,
      basePrice: '1000',
      variants: [{ size: 'M', color: 'Blue', stock: 50 }],
    })
    const order = async (email: string) =>
      (
        await http()
          .post('/api/v1/orders')
          .set('Idempotency-Key', randomUUID())
          .set(
            'X-Forwarded-For',
            `10.3.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`,
          )
          .send({
            items: [{ variantId: p.variants[0]!.id, quantity: 1 }],
            contact: { fullName: 'Buyer', email, phone: '01712345678' },
            address: { division: 'Dhaka', district: 'Dhaka', addressLine1: 'House 1' },
            paymentMethod: 'COD',
            discountCode: 'ten',
            expectedTotal: '960', // 1000 − 100 + 60
          })
          .expect(201)
      ).body.data.orderId as string
    const status = (id: string, body: object) =>
      http().patch(`/api/v1/orders/${id}/status`).send(body).expect(200)

    const sold = await order('a@example.com')
    await status(sold, { from: 'PENDING', to: 'CONFIRMED' }) // a sale
    await order('b@example.com') // still pending: a use, not yet a sale
    const cancelled = await order('c@example.com')
    await status(cancelled, { from: 'PENDING', to: 'CANCELLED', note: 'Customer said no' }) // use given back

    const row = (await http().get('/api/v1/discounts').expect(200)).body.data.items[0]
    expect(row).toMatchObject({
      id: code.id,
      usedCount: 2,
      totalDiscounted: '200',
      salesTotal: '960',
      status: 'ACTIVE',
    })

    const d = (await http().get(`/api/v1/discounts/${code.id}`).expect(200)).body.data
    expect(d).toMatchObject({
      code: 'TEN',
      usedCount: 2,
      totalDiscounted: '200',
      salesTotal: '960',
    })
    expect(d.usages.map((u: { email: string }) => u.email)).toEqual([
      'b@example.com',
      'a@example.com',
    ])
    expect(d.usages[1]).toMatchObject({
      orderId: sold,
      orderNumber: expect.stringMatching(/^NW-\d+$/),
      customerName: 'Buyer',
      amount: '100',
      orderTotal: '960',
      orderStatus: 'CONFIRMED',
    })
  })

  it('detail: archived codes open (history); unknown → 404; bad id → 400', async () => {
    const archived = await makeDiscount({ code: 'PAST1', deletedAt: new Date(), isActive: false })
    expect(
      (await http().get(`/api/v1/discounts/${archived.id}`).expect(200)).body.data,
    ).toMatchObject({
      code: 'PAST1',
      status: 'OFF',
      usages: [],
    })
    await http().get('/api/v1/discounts/00000000-0000-4000-8000-000000000000').expect(404)
    await http().get('/api/v1/discounts/not-an-id').expect(400)
  })

  it('the service can be asked with a pinned "now" (scheduled → active when the day comes)', async () => {
    const svc = app.get(DiscountsService)
    await makeDiscount({ code: 'EID', startsAt: new Date('2026-10-10T18:00:00Z') }) // 11 Oct, 00:00 Dhaka
    const at = async (iso: string) =>
      (await svc.list({ page: 1, pageSize: 10 }, new Date(iso))).items[0]!.status
    expect(await at('2026-10-10T17:59:59Z')).toBe('SCHEDULED')
    expect(await at('2026-10-10T18:00:00Z')).toBe('ACTIVE')
  })

  it('admin-only', async () => {
    const outsider = await createTestApp({ asAdmin: false })
    try {
      await request(outsider.getHttpServer()).get('/api/v1/discounts').expect(401)
      await request(outsider.getHttpServer())
        .get('/api/v1/discounts/00000000-0000-4000-8000-000000000000')
        .expect(401)
    } finally {
      await outsider.close()
    }
  })
})
