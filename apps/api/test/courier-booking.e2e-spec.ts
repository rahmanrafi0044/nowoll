// Phase 2 — "Book with Steadfast" from the admin order page. The courier is a
// fake (test/utils/fake-courier.ts): no real parcel is ever booked.
//   • off in Settings / no keys / not built → refused, nothing booked
//   • booked → SHIPPED with the tracking code, the customer emailed (decision 1A)
//   • the amount to collect is automatic (decision 2A): unpaid COD = total, paid = 0
//   • the courier refusing or down → nothing changes; two clicks → one parcel
import type { NestExpressApplication } from '@nestjs/platform-express'
import { Prisma } from '@nowoll/database'
import request from 'supertest'
import { COURIER } from '../src/courier/courier.js'
import { CUSTOMER_NOTIFIER } from '../src/notifications/customer-notifier.js'
import { createTestApp } from './utils/app.js'
import type { FakeCourier } from './utils/fake-courier.js'
import { makeOrder } from './utils/factories.js'
import type { RecordingCustomerNotifier } from './utils/services.js'
import { resetDatabase, testPrisma } from './utils/test-db.js'

const db = testPrisma()
afterAll(() => db.$disconnect())

describe('courier booking (Steadfast, Phase 2)', () => {
  let app: NestExpressApplication
  let courier: FakeCourier
  let events: RecordingCustomerNotifier['events']
  const http = () => request(app.getHttpServer())
  const book = (id: string, from = 'CONFIRMED') =>
    http().post(`/api/v1/orders/${id}/courier`).send({ from })
  const switchOn = () =>
    db.setting.upsert({
      where: { key: 'steadfast_enabled' },
      create: { key: 'steadfast_enabled', value: true },
      update: { value: true },
    })
  /** A confirmed cash-on-delivery order for ৳1,000. */
  const confirmedOrder = async (fields: Prisma.OrderUpdateInput = {}) => {
    const o = await makeOrder()
    return db.order.update({
      where: { id: o.id },
      data: {
        status: 'CONFIRMED',
        shippingAddressLine2: 'Flat 3B',
        shippingArea: 'Dhanmondi',
        customerNote: 'Call before coming',
        ...fields,
      },
    })
  }

  beforeAll(async () => {
    app = await createTestApp({ asAdmin: true, role: 'STAFF' }) // staff run orders
    courier = app.get<FakeCourier>(COURIER)
    events = app.get<RecordingCustomerNotifier>(CUSTOMER_NOTIFIER).events
  })
  afterAll(() => app.close())
  beforeEach(async () => {
    await resetDatabase()
    courier.reset()
    events.length = 0
  })

  it('switched off in Settings (the default) → refused, and the order page says so', async () => {
    const o = await confirmedOrder()
    expect((await book(o.id).expect(409)).body.error).toBe('COURIER_OFF')
    const detail = (await http().get(`/api/v1/orders/${o.id}`).expect(200)).body.data
    expect(detail.courierBooking).toEqual({ name: 'Steadfast', readiness: 'off' })
    expect(courier.booked).toEqual([])
  })

  it('no keys / not finished → refused with a clear reason, nothing booked', async () => {
    await switchOn()
    const o = await confirmedOrder()
    courier.readyAs = 'no_keys'
    const noKeys = await book(o.id).expect(409)
    expect(noKeys.body).toMatchObject({ error: 'COURIER_NOT_READY' })
    expect(noKeys.body.message).toMatch(/API key and secret key/)
    courier.readyAs = 'not_built'
    expect((await book(o.id).expect(409)).body.message).toMatch(/enter the tracking number by hand/)
    expect(courier.booked).toEqual([])
  })

  it('booked → shipped with the tracking code; COD amount = the total; customer emailed once', async () => {
    await switchOn()
    const o = await confirmedOrder()
    const res = (await book(o.id).expect(200)).body.data
    expect(courier.booked).toEqual([
      {
        invoice: `NW-${o.orderNumber}`,
        recipientName: 'Test Buyer',
        recipientPhone: '+8801712345678',
        recipientAddress: 'House 1, Road 1, Flat 3B, Dhanmondi, Dhaka',
        codAmount: 1000,
        note: 'Call before coming',
        itemDescription: null, // this test order has no items
      },
    ])
    expect(res).toMatchObject({
      status: 'SHIPPED',
      courierName: 'Steadfast',
      trackingNumber: 'SF-TRACK-1',
      courierConsignmentId: 'C-1',
      courierStatus: 'in_review',
      courierBooking: { readiness: 'ready' },
    })
    expect(res.timeline.at(-1)).toMatchObject({
      to: 'SHIPPED',
      note: 'Booked with Steadfast · SF-TRACK-1 · collect ৳1000',
    })
    expect(events).toEqual([{ type: 'order-shipped', id: o.id }])

    // Booking again is refused (already shipped) — never a second parcel.
    await book(o.id, 'CONFIRMED').expect(409)
    expect(courier.booked).toHaveLength(1)
  })

  it('an order already paid online → nothing to collect (৳0)', async () => {
    await switchOn()
    const o = await confirmedOrder({ paymentMethod: 'SSLCOMMERZ', paymentStatus: 'PAID' })
    await book(o.id).expect(200)
    expect(courier.booked[0]!.codAmount).toBe(0)
  })

  it('the courier refuses or is down → nothing changes, the reason is shown', async () => {
    await switchOn()
    const o = await confirmedOrder()
    courier.answer = { ok: false, retryable: false, reason: 'Invalid phone number' }
    const refused = await book(o.id).expect(502)
    expect(refused.body).toMatchObject({ error: 'COURIER_REFUSED' })
    expect(refused.body.message).toMatch(/Invalid phone number/)
    courier.answer = { ok: false, retryable: true, reason: 'timeout' }
    expect((await book(o.id).expect(503)).body.error).toBe('COURIER_UNAVAILABLE')
    const after = await db.order.findUniqueOrThrow({ where: { id: o.id } })
    expect(after).toMatchObject({ status: 'CONFIRMED', courierConsignmentId: null })
    expect(events).toEqual([])
  })

  it('two clicks at once → ONE parcel; a view that is out of date is refused', async () => {
    await switchOn()
    const o = await confirmedOrder()
    courier.delayMs = 300
    const [a, b] = await Promise.all([book(o.id), book(o.id)])
    expect([a.status, b.status].sort()).toEqual([200, 409])
    expect(courier.booked).toHaveLength(1)

    const other = await confirmedOrder()
    await db.order.update({ where: { id: other.id }, data: { status: 'PROCESSING' } })
    await book(other.id, 'CONFIRMED').expect(409) // the admin saw "confirmed"; it's processing now
    expect(courier.booked).toHaveLength(1)
  })

  it('only confirmed or processing orders can be booked', async () => {
    await switchOn()
    const o = await confirmedOrder({ status: 'PENDING' })
    await book(o.id, 'PENDING').expect(400)
  })
})
