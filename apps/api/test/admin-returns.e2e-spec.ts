// Step 35: what the admin returns pages need on top of the step 25 flow —
// when the parcel arrived, search by order number, and each refund in words
// (method, reference, processing / no answer, why it failed or was resolved).
import { randomUUID } from 'node:crypto'
import type { NestExpressApplication } from '@nestjs/platform-express'
import request from 'supertest'
import { PAYMENT_GATEWAY } from '../src/payments/payment-gateway.js'
import { signUp } from './utils/auth.js'
import { createTestApp } from './utils/app.js'
import type { FakePaymentGateway } from './utils/fake-payment-gateway.js'
import { makeCategory, makeProduct, seedShippingZones } from './utils/factories.js'
import { resetDatabase, testPrisma } from './utils/test-db.js'

const db = testPrisma()
afterAll(() => db.$disconnect())

describe('admin returns (step 35)', () => {
  let app: NestExpressApplication
  let admin: NestExpressApplication
  const shop = () => request(app.getHttpServer())
  const staff = () => request(admin.getHttpServer())
  const view = async (id: string) =>
    (await staff().get(`/api/v1/returns/${id}`).expect(200)).body.data

  beforeEach(async () => {
    await resetDatabase()
    await seedShippingZones()
    await db.setting.create({ data: { key: 'return_window_days', value: 7 } })
    app = await createTestApp({ asAdmin: false })
    admin = await createTestApp({ asAdmin: true })
  })
  afterEach(async () => {
    await app.close()
    await admin.close()
  })

  /** A delivered, paid order with one return request. Returns the return id and its order number. */
  async function requested(method: 'COD' | 'SSLCOMMERZ' = 'COD') {
    const rafi = await signUp(app, `r${randomUUID()}@example.com`)
    const c = await makeCategory()
    const p = await makeProduct({
      categoryId: c.id,
      basePrice: '1490',
      variants: [{ size: 'M', color: 'Blue', stock: 5 }],
    })
    const placed = await shop()
      .post('/api/v1/orders')
      .set('Idempotency-Key', randomUUID())
      .set('Cookie', rafi.cookie)
      .send({
        items: [{ variantId: p.variants[0]!.id, quantity: 1 }],
        contact: { fullName: 'Rafi', email: 'rafi@example.com', phone: '01712345678' },
        address: { division: 'Dhaka', district: 'Dhaka', addressLine1: 'House 12' },
        paymentMethod: method,
        expectedTotal: '1550',
      })
      .expect(201)
    const orderId = placed.body.data.orderId as string
    await db.order.update({
      where: { id: orderId },
      data: { status: 'DELIVERED', paymentStatus: 'PAID', deliveredAt: new Date() },
    })
    await db.payment.updateMany({
      where: { orderId },
      data: { status: 'PAID', ...(method === 'SSLCOMMERZ' && { bankTransactionId: 'BANK-1' }) },
    })
    const item = await db.orderItem.findFirstOrThrow({ where: { orderId } })
    const ret = await shop()
      .post('/api/v1/returns')
      .set('Cookie', rafi.cookie)
      .send({
        orderNumber: placed.body.data.displayNumber,
        items: [{ orderItemId: item.id, quantity: 1 }],
        reason: 'WRONG_SIZE',
      })
      .expect(201)
    return { id: ret.body.data.id as string, number: placed.body.data.displayNumber as string }
  }
  async function received(method: 'COD' | 'SSLCOMMERZ' = 'COD') {
    const r = await requested(method)
    await staff()
      .patch(`/api/v1/returns/${r.id}/approve`)
      .send({ note: 'Courier tomorrow.' })
      .expect(200)
    await staff().patch(`/api/v1/returns/${r.id}/receive`).send({ items: [] }).expect(200)
    return r
  }

  it('"received" records when the parcel arrived', async () => {
    const r = await requested()
    expect((await view(r.id)).receivedAt).toBeNull()
    await staff()
      .patch(`/api/v1/returns/${r.id}/approve`)
      .send({ note: 'Courier tomorrow.' })
      .expect(200)
    const before = Date.now()
    const d = (
      await staff().patch(`/api/v1/returns/${r.id}/receive`).send({ items: [] }).expect(200)
    ).body.data
    expect(d.status).toBe('RECEIVED')
    expect(new Date(d.receivedAt).getTime()).toBeGreaterThanOrEqual(before - 1000)
  })

  it('search by order number (any way of writing it); filter by status', async () => {
    const a = await requested()
    const b = await requested()
    await staff().patch(`/api/v1/returns/${b.id}/reject`).send({ reason: 'Worn.' }).expect(200)
    const ids = async (q: string) =>
      (await staff().get(`/api/v1/returns?${q}`).expect(200)).body.data.items.map(
        (x: { id: string }) => x.id,
      )
    expect(await ids(`q=${a.number}`)).toEqual([a.id])
    expect(await ids(`q=${a.number.replace('NW-', '')}`)).toEqual([a.id])
    expect(await ids(`q=${encodeURIComponent(a.number.toLowerCase().replace('-', ' '))}`)).toEqual([
      a.id,
    ])
    expect(await ids('q=rafi')).toEqual([]) // not an order number → nothing (not everything)
    expect(await ids('status=REJECTED')).toEqual([b.id])
    expect(await ids('')).toEqual([a.id, b.id]) // oldest first: a queue
  })

  it('a refund by hand: method MANUAL, the reference, processed now', async () => {
    const r = await received('COD')
    const d = (
      await staff()
        .patch(`/api/v1/returns/${r.id}/refund`)
        .send({ amount: '1490', method: 'MANUAL', reference: 'bKash TrxID 8N7A6K' })
        .expect(200)
    ).body.data
    expect(d.refunds).toEqual([
      expect.objectContaining({
        amount: '1490',
        status: 'PROCESSED',
        method: 'MANUAL',
        stage: null,
        reference: 'bKash TrxID 8N7A6K',
        processedAt: expect.any(String),
      }),
    ])
  })

  it('SSLCommerz "processing" → PENDING / PROCESSING; then resolved by hand → PROCESSED with the note', async () => {
    const r = await received('SSLCOMMERZ')
    admin.get<FakePaymentGateway>(PAYMENT_GATEWAY).refundAnswer = 'processing'
    const d = (
      await staff()
        .patch(`/api/v1/returns/${r.id}/refund`)
        .send({ amount: '1490', method: 'GATEWAY' })
        .expect(200)
    ).body.data
    expect(d.refunds[0]).toMatchObject({
      status: 'PENDING',
      method: 'GATEWAY',
      stage: 'PROCESSING',
      reference: null,
    })
    expect(d.refunds[0].gatewayRefId).toEqual(expect.any(String))

    const resolved = (
      await staff()
        .patch(`/api/v1/returns/${r.id}/refunds/${d.refunds[0].id}/resolve`)
        .send({ outcome: 'REFUNDED', note: 'Seen as refunded in the SSLCommerz panel.' })
        .expect(200)
    ).body.data
    expect(resolved.refunds[0]).toMatchObject({
      status: 'PROCESSED',
      stage: null,
      note: 'Seen as refunded in the SSLCommerz panel.',
    })
  })

  it('SSLCommerz no answer → PENDING / NO_ANSWER; SSLCommerz refusing → FAILED with the reason', async () => {
    const unknown = await received('SSLCOMMERZ')
    const gateway = admin.get<FakePaymentGateway>(PAYMENT_GATEWAY)
    gateway.refundAnswer = 'unreachable'
    const d = (
      await staff()
        .patch(`/api/v1/returns/${unknown.id}/refund`)
        .send({ amount: '1490', method: 'GATEWAY' })
        .expect(200)
    ).body.data
    expect(d.refunds[0]).toMatchObject({ status: 'PENDING', stage: 'NO_ANSWER' })

    const refused = await received('SSLCOMMERZ')
    gateway.refundAnswer = 'failed'
    // A clear refusal: the refund is marked FAILED and the API answers 502, so
    // the admin sees it at once (step 25) — the return page then shows why.
    await staff()
      .patch(`/api/v1/returns/${refused.id}/refund`)
      .send({ amount: '1490', method: 'GATEWAY' })
      .expect(502)
    expect((await view(refused.id)).refunds[0]).toMatchObject({
      status: 'FAILED',
      stage: null,
      note: expect.any(String),
    })
  })

  it('admin-only', async () => {
    await shop().get('/api/v1/returns').expect(401)
    await shop().get('/api/v1/returns/00000000-0000-4000-8000-000000000000').expect(401)
  })
})
