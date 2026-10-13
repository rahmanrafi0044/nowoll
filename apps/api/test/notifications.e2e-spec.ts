// Step 28: which events become which customer notifications — exactly once,
// only AFTER the thing they report is saved. (The recording notifier stands in
// for the queue; queued-notifiers.spec.ts checks the real jobs in Redis.)
import { randomUUID } from 'node:crypto'
import type { NestExpressApplication } from '@nestjs/platform-express'
import request from 'supertest'
import { AUTH_PROVIDER } from '../src/auth/auth-provider.js'
import { CUSTOMER_NOTIFIER } from '../src/notifications/customer-notifier.js'
import { PAYMENT_GATEWAY } from '../src/payments/payment-gateway.js'
import { RefundsService } from '../src/returns/refunds.service.js'
import { signUp } from './utils/auth.js'
import { createTestApp } from './utils/app.js'
import type { FakeAuthProvider } from './utils/fake-auth-provider.js'
import type { FakePaymentGateway } from './utils/fake-payment-gateway.js'
import { makeCategory, makeProduct, seedShippingZones } from './utils/factories.js'
import type { RecordingCustomerNotifier } from './utils/services.js'
import { resetDatabase, testPrisma } from './utils/test-db.js'

const db = testPrisma()
afterAll(() => db.$disconnect())

describe('customer notifications (step 28)', () => {
  let app: NestExpressApplication
  let admin: NestExpressApplication
  let events: RecordingCustomerNotifier['events']
  const http = () => request(app.getHttpServer())

  beforeEach(async () => {
    await resetDatabase()
    app = await createTestApp({ asAdmin: false })
    admin = await createTestApp({ asAdmin: true })
    events = app.get<RecordingCustomerNotifier>(CUSTOMER_NOTIFIER).events
  })
  afterEach(async () => {
    await app.close()
    await admin.close()
  })

  describe('welcome', () => {
    it('one welcome after a successful sign-up — none for a refused one', async () => {
      const { userId } = await signUp(app, 'rafi@example.com')
      expect(events).toEqual([{ type: 'welcome', id: userId }])
      await http()
        .post('/api/v1/auth/register')
        .send({ fullName: 'X', email: 'rafi@example.com', password: 'test-password-1' })
        .expect(409)
      expect(events).toHaveLength(1)
    })

    it('Supabase down → no account, no welcome', async () => {
      app.get<FakeAuthProvider>(AUTH_PROVIDER).down = true
      await http()
        .post('/api/v1/auth/register')
        .send({ fullName: 'X', email: 'x@example.com', password: 'test-password-1' })
        .expect(503)
      expect(events).toEqual([])
    })
  })

  describe('newsletter (double opt-in)', () => {
    const subscribe = (email: string) =>
      http().post('/api/v1/subscribers').send({ email, source: 'footer' }).expect(201)
    const tokenOf = async (email: string) =>
      (await db.subscriber.findUniqueOrThrow({ where: { email } })).confirmToken!

    it('signing up queues ONE confirmation; again while pending → nothing new (no inbox flooding)', async () => {
      await subscribe('fan@example.com')
      await subscribe('fan@example.com')
      await subscribe('FAN@example.com ')
      const s = await db.subscriber.findUniqueOrThrow({ where: { email: 'fan@example.com' } })
      expect(events).toEqual([{ type: 'newsletter-confirm', id: s.id, token: s.confirmToken }])
    })

    it('confirm → SUBSCRIBED (twice is fine); unsubscribe with the same token → UNSUBSCRIBED', async () => {
      await subscribe('fan@example.com')
      const token = await tokenOf('fan@example.com')
      const confirm = (t: string) => http().post('/api/v1/subscribers/confirm').send({ token: t })
      expect((await confirm(token).expect(200)).body.data).toEqual({ status: 'SUBSCRIBED' })
      await confirm(token).expect(200)
      expect(
        await db.subscriber.findUniqueOrThrow({ where: { email: 'fan@example.com' } }),
      ).toMatchObject({
        status: 'SUBSCRIBED',
        confirmedAt: expect.any(Date),
      })

      const unsubscribe = (t: string) =>
        http().post('/api/v1/subscribers/unsubscribe').send({ token: t })
      expect((await unsubscribe(token).expect(200)).body.data).toEqual({ status: 'UNSUBSCRIBED' })
      await unsubscribe(token).expect(200)
      expect(
        (await db.subscriber.findUniqueOrThrow({ where: { email: 'fan@example.com' } })).status,
      ).toBe('UNSUBSCRIBED')
    })

    it('signing up again after unsubscribing → a NEW token and a new confirmation', async () => {
      await subscribe('fan@example.com')
      const first = await tokenOf('fan@example.com')
      await http().post('/api/v1/subscribers/unsubscribe').send({ token: first }).expect(200)
      await subscribe('fan@example.com')
      const second = await tokenOf('fan@example.com')
      expect(second).not.toBe(first)
      // Two confirmation emails, one per sign-up cycle…
      const confirmations = events.filter((e) => e.type === 'newsletter-confirm')
      expect(confirmations.map((e) => e.token)).toEqual([first, second])
      // …and the unsubscribe also updates Resend's copy (step 42).
      expect(events.filter((e) => e.type === 'newsletter-sync')).toHaveLength(1)
    })

    it('an unknown token → 404 LINK_INVALID; a malformed one → 400', async () => {
      const res = await http()
        .post('/api/v1/subscribers/confirm')
        .send({ token: 'a'.repeat(64) })
        .expect(404)
      expect(res.body.error).toBe('LINK_INVALID')
      await http()
        .post('/api/v1/subscribers/unsubscribe')
        .send({ token: 'not-a-token' })
        .expect(400)
    })
  })

  describe('returns and refunds', () => {
    async function receivedReturn(method: 'COD' | 'SSLCOMMERZ' = 'COD') {
      if ((await db.shippingZone.count()) === 0) await seedShippingZones()
      await db.setting.upsert({
        where: { key: 'return_window_days' },
        create: { key: 'return_window_days', value: 7 },
        update: {},
      })
      const rafi = await signUp(app, `r${randomUUID()}@example.com`)
      events.length = 0
      const c = await makeCategory()
      const p = await makeProduct({
        categoryId: c.id,
        basePrice: '1490',
        variants: [{ size: 'M', color: 'Blue', stock: 5 }],
      })
      const placed = await http()
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
      const ret = await http()
        .post('/api/v1/returns')
        .set('Cookie', rafi.cookie)
        .send({
          orderNumber: placed.body.data.displayNumber,
          items: [{ orderItemId: item.id, quantity: 1 }],
          reason: 'WRONG_SIZE',
        })
        .expect(201)
      return ret.body.data.id as string
    }
    const adminPatch = (url: string, body: object = {}) =>
      request(admin.getHttpServer()).patch(`/api/v1${url}`).send(body)
    const adminEvents = () => admin.get<RecordingCustomerNotifier>(CUSTOMER_NOTIFIER).events

    it('approve → "return approved"; reject → "return rejected" — once each', async () => {
      const a = await receivedReturn()
      await adminPatch(`/returns/${a}/approve`, { note: 'Courier tomorrow.' }).expect(200)
      await adminPatch(`/returns/${a}/approve`, { note: 'again' }).expect(409) // refused step → no second email
      expect(adminEvents()).toEqual([{ type: 'return-approved', id: a }])
      const b = await receivedReturn()
      await adminPatch(`/returns/${b}/reject`, { reason: 'Worn.' }).expect(200)
      expect(adminEvents().at(-1)).toEqual({ type: 'return-rejected', id: b })
    })

    it('"refund processed" only when the refund is really done', async () => {
      const id = await receivedReturn('SSLCOMMERZ')
      await adminPatch(`/returns/${id}/approve`, { note: 'ok' }).expect(200)
      await adminPatch(`/returns/${id}/receive`, { items: [] }).expect(200)
      const gateway = admin.get<FakePaymentGateway>(PAYMENT_GATEWAY)

      gateway.refundAnswer = 'processing'
      await adminPatch(`/returns/${id}/refund`, { amount: '1490', method: 'GATEWAY' }).expect(200)
      expect(adminEvents().filter((e) => e.type === 'refund-processed')).toEqual([]) // not yet

      const refund = await db.refund.findFirstOrThrow({ where: { returnRequestId: id } })
      gateway.refundStatuses.set(refund.gatewayRefId!, 'REFUNDED')
      await admin.get(RefundsService).reconcile()
      await admin.get(RefundsService).reconcile() // again: no second email
      expect(adminEvents().filter((e) => e.type === 'refund-processed')).toEqual([
        { type: 'refund-processed', id: refund.id },
      ])
    })

    it('a manual refund → "refund processed"; SSLCommerz never answering → none until resolved', async () => {
      const manual = await receivedReturn()
      await adminPatch(`/returns/${manual}/approve`, { note: 'ok' }).expect(200)
      await adminPatch(`/returns/${manual}/receive`, { items: [] }).expect(200)
      await adminPatch(`/returns/${manual}/refund`, { amount: '1490', method: 'MANUAL' }).expect(
        200,
      )
      expect(adminEvents().at(-1)).toMatchObject({ type: 'refund-processed' })

      const unknown = await receivedReturn('SSLCOMMERZ')
      await adminPatch(`/returns/${unknown}/approve`, { note: 'ok' }).expect(200)
      await adminPatch(`/returns/${unknown}/receive`, { items: [] }).expect(200)
      admin.get<FakePaymentGateway>(PAYMENT_GATEWAY).refundAnswer = 'unreachable'
      const before = adminEvents().length
      const res = await adminPatch(`/returns/${unknown}/refund`, {
        amount: '1490',
        method: 'GATEWAY',
      }).expect(200)
      expect(adminEvents()).toHaveLength(before)
      await adminPatch(`/returns/${unknown}/refunds/${res.body.data.refunds[0].id}/resolve`, {
        outcome: 'REFUNDED',
        note: 'In the panel.',
      }).expect(200)
      expect(adminEvents().at(-1)).toEqual({
        type: 'refund-processed',
        id: res.body.data.refunds[0].id,
      })
    })
  })
})
