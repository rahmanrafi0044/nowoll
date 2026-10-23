// Phase 2, Part B — Steadfast's delivery updates (docs/integrations/courier.md → Webhook).
//   • believed only with the right Bearer token AND X-Signature (HMAC-SHA256 of the raw body)
//   • delivered → DELIVERED, COD marked paid, customer emailed once
//   • cancelled / partial / hold / exceptional → order unchanged, one note for staff
//   • repeats change nothing more; unknown parcels and other events are answered and ignored
import { createHmac } from 'node:crypto'
import type { NestExpressApplication } from '@nestjs/platform-express'
import { Prisma } from '@nowoll/database'
import request from 'supertest'
import { CUSTOMER_NOTIFIER } from '../src/notifications/customer-notifier.js'
import { createTestApp } from './utils/app.js'
import { makeOrder } from './utils/factories.js'
import type { RecordingCustomerNotifier } from './utils/services.js'
import { resetDatabase, testPrisma } from './utils/test-db.js'

const db = testPrisma()
afterAll(() => db.$disconnect())

const TOKEN = 'test-steadfast-webhook-token'
const URL_ = '/api/v1/webhooks/steadfast'
const sign = (raw: string, token = TOKEN) => createHmac('sha256', token).update(raw).digest('hex')

describe('Steadfast webhook', () => {
  let app: NestExpressApplication
  let events: RecordingCustomerNotifier['events']
  const http = () => request(app.getHttpServer())
  /** Exactly what Steadfast does: JSON body, Bearer token, signature over those bytes. */
  const deliver = (event: object, opts: { token?: string; signature?: string } = {}) => {
    const raw = JSON.stringify(event)
    return http()
      .post(URL_)
      .set('Content-Type', 'application/json')
      .set('Authorization', `Bearer ${opts.token ?? TOKEN}`)
      .set('X-Signature', opts.signature ?? sign(raw))
      .set('Idempotency-Key', 'evt-1')
      .send(raw)
  }
  const statusEvent = (status: string, consignmentId: number | string = 1424107) => ({
    notification_type: 'delivery_status',
    consignment_id: consignmentId,
    invoice: 'NW-10001',
    cod_amount: 1000.0,
    status,
    delivery_charge: 60.0,
    tracking_message: '…',
    updated_at: '2026-10-24 12:45:30',
  })
  /** A cash-on-delivery order we booked with Steadfast (consignment 1424107), now SHIPPED. */
  const bookedOrder = async () => {
    const o = await makeOrder()
    await db.payment.create({
      data: {
        orderId: o.id,
        method: 'COD',
        status: 'PENDING',
        amount: new Prisma.Decimal(1000),
        transactionId: `COD-${o.id}`,
      },
    })
    return db.order.update({
      where: { id: o.id },
      data: {
        status: 'SHIPPED',
        courierName: 'Steadfast',
        trackingNumber: '15BAEB8A',
        courierConsignmentId: '1424107',
        courierStatus: 'in_review',
      },
    })
  }

  beforeAll(async () => {
    process.env.STEADFAST_WEBHOOK_TOKEN = TOKEN
    app = await createTestApp({ asAdmin: false })
    events = app.get<RecordingCustomerNotifier>(CUSTOMER_NOTIFIER).events
  })
  afterAll(async () => {
    await app.close()
    delete process.env.STEADFAST_WEBHOOK_TOKEN
  })
  beforeEach(async () => {
    await resetDatabase()
    events.length = 0
  })

  it('refuses a forged call: wrong signature, wrong token, or none at all', async () => {
    const o = await bookedOrder()
    const raw = JSON.stringify(statusEvent('delivered'))
    await deliver(statusEvent('delivered'), { signature: sign(raw, 'guess') }).expect(401)
    await deliver(statusEvent('delivered'), { token: 'guess' }).expect(401)
    await http().post(URL_).set('Content-Type', 'application/json').send(raw).expect(401)
    // Signed, but the body was changed afterwards → refused.
    await http()
      .post(URL_)
      .set('Content-Type', 'application/json')
      .set('Authorization', `Bearer ${TOKEN}`)
      .set('X-Signature', sign(raw))
      .send(raw.replace('delivered', 'cancelled'))
      .expect(401)
    expect(await db.order.findUniqueOrThrow({ where: { id: o.id } })).toMatchObject({
      status: 'SHIPPED',
    })
    expect(events).toEqual([])
  })

  it('delivered → DELIVERED, the COD marked paid, the customer emailed once (repeats change nothing)', async () => {
    const o = await bookedOrder()
    expect((await deliver(statusEvent('delivered')).expect(200)).body.data).toEqual({
      status: 'success',
      outcome: 'delivered',
    })
    const after = await db.order.findUniqueOrThrow({
      where: { id: o.id },
      include: { payments: true, statusHistory: true },
    })
    expect(after).toMatchObject({
      status: 'DELIVERED',
      paymentStatus: 'PAID',
      courierStatus: 'delivered',
    })
    expect(after.deliveredAt).not.toBeNull()
    expect(after.payments[0]).toMatchObject({ status: 'PAID' })
    expect(after.statusHistory.at(-1)).toMatchObject({
      toStatus: 'DELIVERED',
      note: 'Delivered — confirmed by Steadfast (cash collected by the courier)',
    })
    expect(events).toEqual([{ type: 'order-delivered', id: o.id }])

    await deliver(statusEvent('delivered')).expect(200) // Steadfast retries the same event
    expect(events).toHaveLength(1)
    expect(await db.orderStatusHistory.count({ where: { orderId: o.id } })).toBe(1)
  })

  it('cancelled → order unchanged, ONE note for staff; "approval pending" is only shown', async () => {
    const o = await bookedOrder()
    await deliver(statusEvent('cancelled_approval_pending')).expect(200)
    expect(await db.order.findUniqueOrThrow({ where: { id: o.id } })).toMatchObject({
      status: 'SHIPPED',
      courierStatus: 'cancelled_approval_pending',
    })
    expect(await db.orderStatusHistory.count({ where: { orderId: o.id } })).toBe(0)

    expect((await deliver(statusEvent('cancelled')).expect(200)).body.data.outcome).toBe('flagged')
    await deliver(statusEvent('cancelled')).expect(200)
    const notes = await db.orderStatusHistory.findMany({ where: { orderId: o.id } })
    expect(notes).toEqual([
      expect.objectContaining({
        fromStatus: 'SHIPPED',
        toStatus: 'SHIPPED',
        note: 'Steadfast: not delivered — the parcel comes back to you',
      }),
    ])
    expect(await db.order.findUniqueOrThrow({ where: { id: o.id } })).toMatchObject({
      status: 'SHIPPED',
      paymentStatus: 'PENDING',
    })
    expect(events).toEqual([])
  })

  it('a parcel we never booked, or another kind of event → answered 200, nothing changed', async () => {
    const o = await bookedOrder()
    expect((await deliver(statusEvent('delivered', 999)).expect(200)).body.data.outcome).toBe(
      'unknown_parcel',
    )
    expect(
      (await deliver({ notification_type: 'payment_request', amount: 5000 }).expect(200)).body.data
        .outcome,
    ).toBe('ignored')
    expect(await db.order.findUniqueOrThrow({ where: { id: o.id } })).toMatchObject({
      status: 'SHIPPED',
    })
  })

  it('not set up (no token in the server settings) → 404', async () => {
    delete process.env.STEADFAST_WEBHOOK_TOKEN
    const plain = await createTestApp({ asAdmin: false })
    try {
      await request(plain.getHttpServer()).post(URL_).send({}).expect(404)
    } finally {
      await plain.close()
      process.env.STEADFAST_WEBHOOK_TOKEN = TOKEN
    }
  })
})
