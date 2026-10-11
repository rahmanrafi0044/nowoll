// HTTP tests for /api/v1/payment/* (real nowoll_test DB, fake SSLCommerz).
// The business rules are tested in src/payments/payments.service.spec.ts;
// this file checks what only the HTTP layer can get wrong: form bodies,
// rate limits, redirects and the response shape.
import { randomUUID } from 'node:crypto'
import type { NestExpressApplication } from '@nestjs/platform-express'
import request from 'supertest'
import { PAYMENT_GATEWAY } from '../src/payments/payment-gateway.js'
import { createTestApp } from './utils/app.js'
import { makeCategory, makeProduct, seedShippingZones } from './utils/factories.js'
import type { FakePaymentGateway } from './utils/fake-payment-gateway.js'
import { resetDatabase, testPrisma } from './utils/test-db.js'

const db = testPrisma()
afterAll(() => db.$disconnect())

describe('/payment', () => {
  let app: NestExpressApplication
  let gateway: FakePaymentGateway
  const http = () => request(app.getHttpServer())

  beforeEach(async () => {
    await resetDatabase()
    await seedShippingZones()
    app = await createTestApp({ asAdmin: false }) // fresh per test: rate limits must not leak
    gateway = app.get(PAYMENT_GATEWAY)
  })
  afterEach(() => app.close())

  async function placeOnlineOrder(): Promise<string> {
    const c = await makeCategory()
    const p = await makeProduct({
      categoryId: c.id,
      basePrice: '1490',
      variants: [{ size: 'M', color: 'Blue', stock: 20 }],
    })
    const res = await http()
      .post('/api/v1/orders')
      .set('Idempotency-Key', randomUUID())
      .send({
        items: [{ variantId: p.variants[0]!.id, quantity: 1 }],
        contact: { fullName: 'Rafi Rahman', email: 'rafi@example.com', phone: '01712345678' },
        address: {
          division: 'Dhaka',
          district: 'Dhaka',
          addressLine1: 'House 12, Road 5',
        },
        paymentMethod: 'SSLCOMMERZ',
        expectedTotal: '1550',
      })
      .expect(201)
    expect(res.body.data.nextAction).toBe('PAY')
    return res.body.data.orderId
  }

  /** Places an online order and presses Pay; returns the order id and tran_id. */
  async function started() {
    const orderId = await placeOnlineOrder()
    await http().post('/api/v1/payment/sslcommerz/init').send({ orderId }).expect(200)
    return { orderId, tranId: gateway.created.at(-1)!.transactionId }
  }

  it('switching online payment off (step 38c) doesn’t strand an order already placed: it can still be paid', async () => {
    const orderId = await placeOnlineOrder()
    await testPrisma().setting.create({ data: { key: 'payment_online_enabled', value: false } })
    await http().post('/api/v1/payment/sslcommerz/init').send({ orderId }).expect(200)
  })

  describe('POST /payment/sslcommerz/init', () => {
    it('200 with the SSLCommerz page to send the customer to', async () => {
      const orderId = await placeOnlineOrder()
      const res = await http().post('/api/v1/payment/sslcommerz/init').send({ orderId }).expect(200)
      expect(res.body).toEqual({
        success: true,
        data: {
          redirectUrl: `https://sandbox.sslcommerz.com/pay/${gateway.created[0]!.transactionId}`,
        },
      })
    })

    it('400 for a missing or malformed order id; 404 for an unknown one', async () => {
      await http().post('/api/v1/payment/sslcommerz/init').send({}).expect(400)
      await http().post('/api/v1/payment/sslcommerz/init').send({ orderId: 'abc' }).expect(400)
      const res = await http()
        .post('/api/v1/payment/sslcommerz/init')
        .send({ orderId: randomUUID() })
        .expect(404)
      expect(res.body.success).toBe(false)
    })

    it('409 ALREADY_PAID once the order is paid', async () => {
      const { orderId, tranId } = await started()
      await http()
        .post('/api/v1/payment/sslcommerz/ipn')
        .type('form')
        .send({ tran_id: tranId, val_id: gateway.pay(tranId, '1550') })
      const res = await http().post('/api/v1/payment/sslcommerz/init').send({ orderId }).expect(409)
      expect(res.body.error).toBe('ALREADY_PAID')
    })

    it('5 per minute per visitor, then 429 (CLAUDE.md §8)', async () => {
      const orderId = await placeOnlineOrder()
      for (let i = 0; i < 5; i++)
        await http().post('/api/v1/payment/sslcommerz/init').send({ orderId }).expect(200)
      await http().post('/api/v1/payment/sslcommerz/init').send({ orderId }).expect(429)
    })
  })

  describe('POST /payment/sslcommerz/ipn', () => {
    it('reads the form-encoded body SSLCommerz sends and confirms a validated payment', async () => {
      const { orderId, tranId } = await started()
      const res = await http()
        .post('/api/v1/payment/sslcommerz/ipn')
        .type('form')
        .send({
          tran_id: tranId,
          val_id: gateway.pay(tranId, '1550'),
          status: 'VALID',
          amount: '1550.00',
          card_type: 'BKASH-BKash',
          a_field_sslcommerz_might_add_one_day: 'x', // must NOT be rejected
        })
        .expect(200)
      expect(res.body).toEqual({ success: true, data: { received: true } })
      expect(await db.order.findUniqueOrThrow({ where: { id: orderId } })).toMatchObject({
        status: 'CONFIRMED',
        paymentStatus: 'PAID',
      })
    })

    it('is NEVER rate-limited (a dropped notification could lose a payment)', async () => {
      for (let i = 0; i < 110; i++) {
        await http()
          .post('/api/v1/payment/sslcommerz/ipn')
          .type('form')
          .send({ tran_id: `UNKNOWN-${i}` })
          .expect(200)
      }
    })

    it('a forged "status=VALID" answers 200 but changes nothing', async () => {
      const { orderId, tranId } = await started()
      await http()
        .post('/api/v1/payment/sslcommerz/ipn')
        .type('form')
        .send({ tran_id: tranId, val_id: 'FORGED', status: 'VALID', amount: '1550.00' })
        .expect(200)
      expect((await db.order.findUniqueOrThrow({ where: { id: orderId } })).paymentStatus).toBe(
        'PENDING',
      )
    })
  })

  describe('the browser coming back (success / fail / cancel)', () => {
    it('success → 303 to the thank-you page', async () => {
      const { orderId, tranId } = await started()
      const res = await http()
        .post('/api/v1/payment/sslcommerz/success')
        .type('form')
        .send({ tran_id: tranId, val_id: gateway.pay(tranId, '1550') })
        .expect(303)
      expect(res.headers.location).toBe(`https://nowoll.test/checkout/success?order=${orderId}`)
    })

    it('fail and cancel → 303 to the payment-failed page with the reason', async () => {
      const { orderId, tranId } = await started()
      for (const reason of ['fail', 'cancel'] as const) {
        const res = await http()
          .post(`/api/v1/payment/sslcommerz/${reason}`)
          .type('form')
          .send({ tran_id: tranId })
          .expect(303)
        expect(res.headers.location).toBe(
          `https://nowoll.test/checkout/payment-failed?order=${orderId}&reason=${reason}`,
        )
      }
    })

    it('an unknown transaction → 303 back to checkout with an error', async () => {
      const res = await http()
        .post('/api/v1/payment/sslcommerz/success')
        .type('form')
        .send({})
        .expect(303)
      expect(res.headers.location).toBe('https://nowoll.test/checkout?payment=error')
    })

    it('redirects are not rate-limited either (customers share mobile-network IPs)', async () => {
      for (let i = 0; i < 105; i++)
        await http().post('/api/v1/payment/sslcommerz/cancel').type('form').send({}).expect(303)
    })
  })

  describe('GET /payment/status/:orderId', () => {
    it('reports the order and payment state', async () => {
      const { orderId } = await started()
      const res = await http().get(`/api/v1/payment/status/${orderId}`).expect(200)
      expect(res.body.data).toEqual({
        orderId,
        displayNumber: 'NW-10001',
        status: 'PENDING',
        paymentMethod: 'SSLCOMMERZ',
        paymentStatus: 'PENDING',
        total: '1550',
        canRetry: true,
      })
    })

    it('400 for a malformed id, 404 for an unknown one', async () => {
      await http().get('/api/v1/payment/status/abc').expect(400)
      await http().get(`/api/v1/payment/status/${randomUUID()}`).expect(404)
    })

    it('30 per minute per visitor, then 429', async () => {
      const id = randomUUID()
      for (let i = 0; i < 30; i++) await http().get(`/api/v1/payment/status/${id}`).expect(404)
      await http().get(`/api/v1/payment/status/${id}`).expect(429)
    })
  })
})
