// Step 31a: running orders from the admin panel.
//   • only the allowed status changes; the customer emails go out exactly once, after saving
//   • two staff members at once: a change based on an outdated view is refused
//   • cancelling puts the stock back; COD cash collected → paid
import { randomUUID } from 'node:crypto'
import type { NestExpressApplication } from '@nestjs/platform-express'
import request from 'supertest'
import { CUSTOMER_NOTIFIER } from '../src/notifications/customer-notifier.js'
import { signInAsStaff } from './utils/admin.js'
import { createTestApp } from './utils/app.js'
import { makeCategory, makeProduct, seedShippingZones } from './utils/factories.js'
import type { RecordingCustomerNotifier } from './utils/services.js'
import { resetDatabase, testPrisma } from './utils/test-db.js'

const db = testPrisma()
afterAll(() => db.$disconnect())

describe('admin orders (step 31a)', () => {
  let app: NestExpressApplication
  let events: RecordingCustomerNotifier['events']
  const http = () => request(app.getHttpServer())
  const status = (id: string, body: object) =>
    http().patch(`/api/v1/orders/${id}/status`).send(body)
  const detail = async (id: string) =>
    (await http().get(`/api/v1/orders/${id}`).expect(200)).body.data

  beforeAll(async () => {
    app = await createTestApp({ asAdmin: true })
    events = app.get<RecordingCustomerNotifier>(CUSTOMER_NOTIFIER).events
  })
  afterAll(() => app.close())
  beforeEach(async () => {
    await resetDatabase()
    await seedShippingZones()
    events.length = 0
  })

  /** A real order through the shop's checkout: 2 × ৳1490 shirt, delivered inside Dhaka (৳60). */
  async function placeOrder(
    method: 'COD' | 'SSLCOMMERZ' = 'COD',
    contact = { fullName: 'Rafi Rahman', email: 'rafi@example.com', phone: '01712345678' },
  ) {
    const c = await makeCategory()
    const p = await makeProduct({
      categoryId: c.id,
      basePrice: '1490',
      variants: [{ size: 'M', color: 'Blue', stock: 5 }],
    })
    const res = await http()
      .post('/api/v1/orders')
      .set('Idempotency-Key', randomUUID())
      .set(
        'X-Forwarded-For',
        `10.0.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`,
      )
      .send({
        items: [{ variantId: p.variants[0]!.id, quantity: 2 }],
        contact,
        address: { division: 'Dhaka', district: 'Dhaka', addressLine1: 'House 12, Road 5' },
        paymentMethod: method,
        expectedTotal: '3040',
      })
      .expect(201)
    return { id: res.body.data.orderId as string, variantId: p.variants[0]!.id }
  }
  const stockOf = async (variantId: string) =>
    (await db.productVariant.findUniqueOrThrow({ where: { id: variantId } })).stock

  describe('the COD flow', () => {
    it('confirm → processing → shipped (courier + tracking) → delivered with cash: one email each, all on the timeline', async () => {
      const { id } = await placeOrder()
      let d = await detail(id)
      expect(d).toMatchObject({ status: 'PENDING', paymentMethod: 'COD', paymentStatus: 'PENDING' })
      expect(d.allowedNext).toEqual(['CONFIRMED', 'CANCELLED'])

      await status(id, { from: 'PENDING', to: 'CONFIRMED', note: 'Called — confirmed.' }).expect(
        200,
      )
      await status(id, { from: 'CONFIRMED', to: 'PROCESSING' }).expect(200)
      expect(events).toEqual([]) // no email for internal steps
      d = (
        await status(id, {
          from: 'PROCESSING',
          to: 'SHIPPED',
          courierName: 'Steadfast',
          trackingNumber: 'SF123456',
        }).expect(200)
      ).body.data
      expect(d).toMatchObject({
        status: 'SHIPPED',
        courierName: 'Steadfast',
        trackingNumber: 'SF123456',
      })
      expect(d.canMarkCashCollected).toBe(true)
      expect(d.allowedNext).toEqual(['DELIVERED']) // never "cancel" once it's with the courier
      expect(events).toEqual([{ type: 'order-shipped', id }])

      d = (await status(id, { from: 'SHIPPED', to: 'DELIVERED', cashCollected: true }).expect(200))
        .body.data
      expect(d).toMatchObject({
        status: 'DELIVERED',
        paymentStatus: 'PAID',
        canMarkCashCollected: false,
      })
      expect(d.payments[0]).toMatchObject({
        method: 'COD',
        status: 'PAID',
        paidAt: expect.any(String),
      })
      expect(events).toEqual([
        { type: 'order-shipped', id },
        { type: 'order-delivered', id },
      ])
      expect(d.allowedNext).toEqual([])

      expect(
        d.timeline.map((t: { from: string | null; to: string; note: string | null }) => [
          t.from,
          t.to,
          t.note,
        ]),
      ).toEqual([
        [null, 'PENDING', 'Order placed'],
        ['PENDING', 'CONFIRMED', 'Called — confirmed.'],
        ['CONFIRMED', 'PROCESSING', null],
        ['PROCESSING', 'SHIPPED', 'Steadfast · SF123456'],
        ['SHIPPED', 'DELIVERED', 'Cash collected'],
      ])
      const row = await db.order.findUniqueOrThrow({ where: { id } })
      expect(row.confirmedAt).toBeInstanceOf(Date)
      expect(row.shippedAt).toBeInstanceOf(Date)
      expect(row.deliveredAt).toBeInstanceOf(Date)
    })

    it('CONFIRMED → SHIPPED directly is allowed (same-day packing)', async () => {
      const { id } = await placeOrder()
      await status(id, { from: 'PENDING', to: 'CONFIRMED' }).expect(200)
      await status(id, {
        from: 'CONFIRMED',
        to: 'SHIPPED',
        courierName: 'Pathao',
        trackingNumber: 'P-1',
      }).expect(200)
    })

    it('delivered without the cash yet → still unpaid; "cash collected" later marks it paid (once)', async () => {
      const { id } = await placeOrder()
      await status(id, { from: 'PENDING', to: 'CONFIRMED' }).expect(200)
      await status(id, {
        from: 'CONFIRMED',
        to: 'SHIPPED',
        courierName: 'Pathao',
        trackingNumber: 'P-1',
      }).expect(200)
      await status(id, { from: 'SHIPPED', to: 'DELIVERED', cashCollected: false }).expect(200)
      expect((await detail(id)).paymentStatus).toBe('PENDING')

      const paid = (await http().patch(`/api/v1/orders/${id}/cash-collected`).expect(200)).body.data
      expect(paid.paymentStatus).toBe('PAID')
      expect(paid.timeline.at(-1)).toMatchObject({
        from: 'DELIVERED',
        to: 'DELIVERED',
        note: 'Cash collected',
      })
      const again = await http().patch(`/api/v1/orders/${id}/cash-collected`).expect(409)
      expect(again.body.message).toMatch(/already marked paid/)
    })

    it('cash can’t be marked collected before shipping, or for an online order', async () => {
      const cod = await placeOrder()
      await http().patch(`/api/v1/orders/${cod.id}/cash-collected`).expect(409)
      const online = await placeOrder('SSLCOMMERZ')
      await http().patch(`/api/v1/orders/${online.id}/cash-collected`).expect(409)
    })
  })

  describe('what is refused', () => {
    it('an unpaid ONLINE order can’t be confirmed by hand (its payment confirms it) — only cancelled', async () => {
      const { id } = await placeOrder('SSLCOMMERZ')
      expect((await detail(id)).allowedNext).toEqual(['CANCELLED'])
      const res = await status(id, { from: 'PENDING', to: 'CONFIRMED' }).expect(409)
      expect(res.body.error).toBe('STATUS_CHANGE_NOT_ALLOWED')
    })

    it('skipping steps or going back', async () => {
      const { id } = await placeOrder()
      await status(id, {
        from: 'PENDING',
        to: 'SHIPPED',
        courierName: 'X',
        trackingNumber: 'Y',
      }).expect(409)
      await status(id, { from: 'PENDING', to: 'DELIVERED' }).expect(409)
      await status(id, { from: 'PENDING', to: 'CONFIRMED' }).expect(200)
      await status(id, { from: 'CONFIRMED', to: 'PENDING' }).expect(409)
      await status(id, {
        from: 'CONFIRMED',
        to: 'SHIPPED',
        courierName: 'X',
        trackingNumber: 'Y',
      }).expect(200)
      const cancel = await status(id, {
        from: 'SHIPPED',
        to: 'CANCELLED',
        note: 'Too late',
      }).expect(409)
      expect(cancel.body.message).toMatch(/can't be cancelled/)
      expect(events).toEqual([{ type: 'order-shipped', id }]) // only the real shipment
    })

    it('shipping needs the courier AND the tracking number', async () => {
      const { id } = await placeOrder()
      await status(id, { from: 'PENDING', to: 'CONFIRMED' }).expect(200)
      await status(id, { from: 'CONFIRMED', to: 'SHIPPED' }).expect(400)
      await status(id, {
        from: 'CONFIRMED',
        to: 'SHIPPED',
        courierName: 'Pathao',
        trackingNumber: '  ',
      }).expect(400)
      expect((await detail(id)).status).toBe('CONFIRMED')
      expect(events).toEqual([])
    })

    it('someone else changed it meanwhile → refused, nothing overwritten', async () => {
      const { id } = await placeOrder()
      await status(id, { from: 'PENDING', to: 'CONFIRMED' }).expect(200) // person A
      // person B's screen still says PENDING:
      const res = await status(id, {
        from: 'PENDING',
        to: 'CANCELLED',
        note: 'Customer said no',
      }).expect(409)
      expect(res.body.error).toBe('ORDER_CHANGED')
      expect(res.body.message).toMatch(/now confirmed/)
      expect((await detail(id)).status).toBe('CONFIRMED')
    })

    it('outdated view, even when the change would be allowed from the new status → refused', async () => {
      const { id } = await placeOrder()
      await status(id, { from: 'PENDING', to: 'CONFIRMED' }).expect(200)
      await status(id, { from: 'CONFIRMED', to: 'PROCESSING' }).expect(200) // person A starts packing
      // person B still sees CONFIRMED and ships — allowed from PROCESSING too, but B didn't see A's change
      const res = await status(id, {
        from: 'CONFIRMED',
        to: 'SHIPPED',
        courierName: 'Pathao',
        trackingNumber: 'P-9',
      }).expect(409)
      expect(res.body.error).toBe('ORDER_CHANGED')
      expect((await detail(id)).status).toBe('PROCESSING')
      expect(events).toEqual([])
    })

    it('unknown order → 404; bad body → 400', async () => {
      await status('00000000-0000-4000-8000-000000000000', {
        from: 'PENDING',
        to: 'CONFIRMED',
      }).expect(404)
      const { id } = await placeOrder()
      await status(id, { from: 'PENDING', to: 'LOST' }).expect(400)
    })
  })

  describe('cancelling', () => {
    it('needs a reason; puts the stock back (logged); recorded on the timeline', async () => {
      const { id, variantId } = await placeOrder()
      expect(await stockOf(variantId)).toBe(3) // 5 − 2
      await status(id, { from: 'PENDING', to: 'CANCELLED' }).expect(400)
      const d = (
        await status(id, {
          from: 'PENDING',
          to: 'CANCELLED',
          note: 'Customer changed their mind',
        }).expect(200)
      ).body.data
      expect(d).toMatchObject({
        status: 'CANCELLED',
        cancelReason: 'Customer changed their mind',
        allowedNext: [],
      })
      expect(d.timeline.at(-1)).toMatchObject({
        from: 'PENDING',
        to: 'CANCELLED',
        note: 'Customer changed their mind',
      })
      expect(await stockOf(variantId)).toBe(5)
      expect(
        await db.inventoryLog.count({ where: { orderId: id, reason: 'ORDER_CANCELLED' } }),
      ).toBe(1)
      expect(events).toEqual([])
    })
  })

  describe('tracking and notes', () => {
    it('the tracking number can be corrected after shipping — no second email; not before shipping', async () => {
      const { id } = await placeOrder()
      await http()
        .patch(`/api/v1/orders/${id}/tracking`)
        .send({ courierName: 'A', trackingNumber: 'B' })
        .expect(409)
      await status(id, { from: 'PENDING', to: 'CONFIRMED' }).expect(200)
      await status(id, {
        from: 'CONFIRMED',
        to: 'SHIPPED',
        courierName: 'Steadfast',
        trackingNumber: 'SF12',
      }).expect(200)
      const d = (
        await http()
          .patch(`/api/v1/orders/${id}/tracking`)
          .send({ courierName: 'Steadfast', trackingNumber: ' SF123 ' })
          .expect(200)
      ).body.data
      expect(d.trackingNumber).toBe('SF123')
      expect(events).toEqual([{ type: 'order-shipped', id }])
    })

    it('staff notes: saved, cleared with "" or null; required in the body', async () => {
      const { id } = await placeOrder()
      const notes = (body: object) => http().patch(`/api/v1/orders/${id}/notes`).send(body)
      expect(
        (await notes({ adminNotes: '  Fragile — double box  ' }).expect(200)).body.data.adminNotes,
      ).toBe('Fragile — double box')
      expect((await notes({ adminNotes: '' }).expect(200)).body.data.adminNotes).toBeNull()
      await notes({ adminNotes: 'x' }).expect(200)
      expect((await notes({ adminNotes: null }).expect(200)).body.data.adminNotes).toBeNull()
      await notes({}).expect(400)
    })
  })

  describe('list', () => {
    it('newest first; search by number, phone (any format), name or email; filters', async () => {
      const a = await placeOrder('COD', {
        fullName: 'Rafi Rahman',
        email: 'rafi@example.com',
        phone: '01712345678',
      })
      const b = await placeOrder('SSLCOMMERZ', {
        fullName: 'Nadia Islam',
        email: 'nadia@example.com',
        phone: '01898765432',
      })
      const ids = async (q: string) =>
        (await http().get(`/api/v1/orders?${q}`).expect(200)).body.data.items.map(
          (o: { id: string }) => o.id,
        )
      expect(await ids('')).toEqual([b.id, a.id])
      const number = (await detail(a.id)).number as string
      expect(await ids(`q=${number}`)).toEqual([a.id])
      expect(await ids(`q=${number.replace('NW-', '')}`)).toEqual([a.id])
      expect(await ids('q=01712-345678')).toEqual([a.id])
      expect(await ids('q=%2B8801898765432')).toEqual([b.id])
      expect(await ids('q=nadia')).toEqual([b.id])
      expect(await ids('q=RAFI%40EXAMPLE')).toEqual([a.id])
      expect(await ids('paymentMethod=COD')).toEqual([a.id])
      expect(await ids('status=PENDING&paymentStatus=PENDING')).toEqual([b.id, a.id])
      const row = (await http().get('/api/v1/orders').expect(200)).body.data.items[1]
      expect(row).toMatchObject({
        id: a.id,
        number,
        status: 'PENDING',
        customerName: 'Rafi Rahman',
        district: 'Dhaka',
        itemCount: 1,
        total: '3040',
      })
    })

    it('date range = whole Bangladesh days', async () => {
      const early = await placeOrder()
      const late = await placeOrder()
      await db.order.update({
        where: { id: early.id },
        data: { createdAt: new Date('2026-10-05T17:59:59Z') },
      }) // 5 Oct 23:59:59 Dhaka
      await db.order.update({
        where: { id: late.id },
        data: { createdAt: new Date('2026-10-05T18:00:00Z') },
      }) // 6 Oct 00:00 Dhaka
      const ids = async (q: string) =>
        (await http().get(`/api/v1/orders?${q}`).expect(200)).body.data.items.map(
          (o: { id: string }) => o.id,
        )
      expect(await ids('from=2026-10-06&to=2026-10-06')).toEqual([late.id])
      expect(await ids('to=2026-10-05')).toEqual([early.id])
      await http().get('/api/v1/orders?from=6-10-2026').expect(400)
    })
  })

  it('the staff member’s name is on the timeline (real admin sign-in)', async () => {
    const real = await createTestApp({ asAdmin: false })
    try {
      const { id } = await placeOrder()
      const { cookie } = await signInAsStaff(real, 'rafi@nowoll.com')
      const res = await request(real.getHttpServer())
        .patch(`/api/v1/orders/${id}/status`)
        .set('Cookie', cookie)
        .send({ from: 'PENDING', to: 'CONFIRMED' })
        .expect(200)
      expect(res.body.data.timeline.at(-1)).toMatchObject({ to: 'CONFIRMED', by: 'Rafi' })
    } finally {
      await real.close()
    }
  })

  it('admin-only — and the customer routes under /orders still work', async () => {
    const outsider = await createTestApp({ asAdmin: false })
    try {
      const id = '00000000-0000-4000-8000-000000000000'
      const h = () => request(outsider.getHttpServer())
      await h().get('/api/v1/orders').expect(401)
      await h().get(`/api/v1/orders/${id}`).expect(401)
      await h()
        .patch(`/api/v1/orders/${id}/status`)
        .send({ from: 'PENDING', to: 'CONFIRMED' })
        .expect(401)
      await h().patch(`/api/v1/orders/${id}/tracking`).send({}).expect(401)
      await h().patch(`/api/v1/orders/${id}/notes`).send({}).expect(401)
      await h().patch(`/api/v1/orders/${id}/cash-collected`).expect(401)
      // /orders/my is the CUSTOMER's list: "please sign in" (customer), not the admin guard
      const my = await h().get('/api/v1/orders/my').expect(401)
      expect(my.body.error).toBe('NOT_SIGNED_IN')
      await h()
        .post('/api/v1/orders/track')
        .send({ orderNumber: 'NW-1', contact: 'a@b.co' })
        .expect(404)
    } finally {
      await outsider.close()
    }
  })
})
