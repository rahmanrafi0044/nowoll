// HTTP tests for POST /orders/track and GET /orders/:id/receipt (real nowoll_test DB).
import { randomUUID } from 'node:crypto'
import type { NestExpressApplication } from '@nestjs/platform-express'
import request from 'supertest'
import { createTestApp } from './utils/app.js'
import { makeCategory, makeProduct, seedShippingZones } from './utils/factories.js'
import { resetDatabase, testPrisma } from './utils/test-db.js'

const db = testPrisma()
afterAll(() => db.$disconnect())

describe('order lookup', () => {
  let app: NestExpressApplication
  const http = () => request(app.getHttpServer())

  beforeEach(async () => {
    await resetDatabase()
    await seedShippingZones()
    app = await createTestApp({ asAdmin: false }) // fresh per test: rate limits must not leak
  })
  afterEach(() => app.close())

  async function placeOrder(): Promise<string> {
    const c = await makeCategory()
    const p = await makeProduct({
      categoryId: c.id,
      basePrice: '1490',
      variants: [{ size: 'M', color: 'Blue', stock: 5 }],
    })
    const res = await http()
      .post('/api/v1/orders')
      .set('Idempotency-Key', randomUUID())
      .send({
        items: [{ variantId: p.variants[0]!.id, quantity: 1 }],
        contact: { fullName: 'Rafi Rahman', email: 'rafi@example.com', phone: '01712345678' },
        address: { division: 'Dhaka', district: 'Dhaka', addressLine1: 'House 12, Road 5' },
        paymentMethod: 'COD',
        expectedTotal: '1550',
      })
      .expect(201)
    return res.body.data.orderId
  }

  describe('POST /orders/track', () => {
    const track = (body: object) => http().post('/api/v1/orders/track').send(body)

    it('200 with the tracking view (money as strings, dates as ISO text)', async () => {
      await placeOrder()
      const res = await track({ orderNumber: 'NW-10001', contact: 'rafi@example.com' }).expect(200)
      expect(res.body.data).toMatchObject({
        displayNumber: 'NW-10001',
        status: 'PENDING',
        total: '1550',
        deliveryArea: { district: 'Dhaka' },
        timeline: [{ status: 'PENDING', at: expect.stringMatching(/^\d{4}-\d\d-\d\dT/) }],
      })
      expect(res.body.data).not.toHaveProperty('deliveryAddress')
    })

    it('404 with the same message for a wrong contact or a missing order', async () => {
      await placeOrder()
      const a = await track({ orderNumber: 'NW-10001', contact: 'x@example.com' }).expect(404)
      const b = await track({ orderNumber: 'NW-10002', contact: 'rafi@example.com' }).expect(404)
      expect(a.body.message).toBe(b.body.message)
    })

    it('400 for missing fields or extra ones', async () => {
      await track({ orderNumber: 'NW-10001' }).expect(400)
      await track({ orderNumber: 'NW-10001', contact: 'rafi@example.com', email: 'x' }).expect(400)
    })

    it('5 per minute per visitor, then 429 (stops guessing order numbers)', async () => {
      for (let i = 0; i < 5; i++)
        await track({ orderNumber: `NW-${10001 + i}`, contact: 'rafi@example.com' }).expect(404)
      await track({ orderNumber: 'NW-10010', contact: 'rafi@example.com' }).expect(429)
    })

    it('the email never has to be in a URL (GET is not offered)', async () => {
      await http().get('/api/v1/orders/track?orderId=NW-10001&email=rafi@example.com').expect(404)
    })
  })

  describe('GET /orders/:id/receipt', () => {
    it('200 with the full receipt', async () => {
      const id = await placeOrder()
      const res = await http().get(`/api/v1/orders/${id}/receipt`).expect(200)
      expect(res.body.data).toMatchObject({
        orderId: id,
        displayNumber: 'NW-10001',
        deliveryAddress: { addressLine1: 'House 12, Road 5' },
        totals: { total: '1550', shippingFee: '60' },
      })
      expect(JSON.stringify(res.body.data)).not.toMatch(/adminNotes|idempotency/i)
    })

    it('400 for a malformed id, 404 for an unknown one', async () => {
      await http().get('/api/v1/orders/abc/receipt').expect(400)
      await http().get(`/api/v1/orders/${randomUUID()}/receipt`).expect(404)
    })
  })
})
