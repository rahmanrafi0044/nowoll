// HTTP tests for /api/v1/returns (step 25). Real nowoll_test DB, fake Supabase
// Auth, FAKE SSLCommerz (no real money). Orders are marked DELIVERED / PAID
// directly in the database — the admin screens that do it arrive in Phase 5.
import { randomUUID } from 'node:crypto'
import type { NestExpressApplication } from '@nestjs/platform-express'
import { Prisma } from '@nowoll/database'
import request from 'supertest'
import { PAYMENT_GATEWAY } from '../src/payments/payment-gateway.js'
import { RefundsService } from '../src/returns/refunds.service.js'
import { signUp } from './utils/auth.js'
import { createTestApp } from './utils/app.js'
import { makeCategory, makeProduct, seedShippingZones } from './utils/factories.js'
import type { FakePaymentGateway } from './utils/fake-payment-gateway.js'
import { resetDatabase, testPrisma } from './utils/test-db.js'

const db = testPrisma()
afterAll(() => db.$disconnect())

const DAY = 86_400_000

describe('/returns', () => {
  let app: NestExpressApplication
  let admin: NestExpressApplication
  let gateway: FakePaymentGateway
  let rafi: { cookie: string; userId: string }
  let shirt: string // variant id, ৳1490
  let panjabi: string // variant id, ৳2490
  const http = () => request(app.getHttpServer())
  const as = (who: { cookie: string }) => ({
    get: (url: string) => http().get(`/api/v1${url}`).set('Cookie', who.cookie),
    post: (url: string, body: object) =>
      http().post(`/api/v1${url}`).set('Cookie', who.cookie).send(body),
  })
  const adminPatch = (url: string, body: object = {}) =>
    request(admin.getHttpServer()).patch(`/api/v1${url}`).send(body)
  const adminGet = (url: string) => request(admin.getHttpServer()).get(`/api/v1${url}`)

  /** A delivered order: 2 shirts + 1 panjabi (৳5470 + ৳60 delivery), paid. */
  async function deliveredOrder(
    opts: { method?: 'COD' | 'SSLCOMMERZ'; deliveredDaysAgo?: number; discount?: string } = {},
  ) {
    const res = await http()
      .post('/api/v1/orders')
      .set('Idempotency-Key', randomUUID())
      .set('Cookie', rafi.cookie)
      .send({
        items: [
          { variantId: shirt, quantity: 2 },
          { variantId: panjabi, quantity: 1 },
        ],
        contact: { fullName: 'Rafi Rahman', email: 'rafi@example.com', phone: '01712345678' },
        address: { division: 'Dhaka', district: 'Dhaka', addressLine1: 'House 12, Road 5' },
        paymentMethod: opts.method ?? 'COD',
        ...(opts.discount && { discountCode: opts.discount }),
        expectedTotal: opts.discount ? '4983' : '5530',
      })
      .expect(201)
    const orderId = res.body.data.orderId as string
    await db.order.update({
      where: { id: orderId },
      data: {
        status: 'DELIVERED',
        paymentStatus: 'PAID',
        deliveredAt: new Date(Date.now() - (opts.deliveredDaysAgo ?? 1) * DAY),
      },
    })
    await db.payment.updateMany({
      where: { orderId },
      data: {
        status: 'PAID',
        ...(opts.method === 'SSLCOMMERZ' && { bankTransactionId: 'BANK-1', valId: 'VAL-1' }),
      },
    })
    const items = await db.orderItem.findMany({ where: { orderId }, orderBy: { unitPrice: 'asc' } })
    return {
      orderId,
      number: res.body.data.displayNumber as string,
      shirtLine: items[0]!.id,
      panjabiLine: items[1]!.id,
    }
  }

  const askReturn = (
    number: string,
    items: { orderItemId: string; quantity: number }[],
    extra: object = {},
  ) => as(rafi).post('/returns', { orderNumber: number, items, reason: 'WRONG_SIZE', ...extra })

  /** Request → approve → receive, ready to refund. */
  async function receivedReturn(
    order: Awaited<ReturnType<typeof deliveredOrder>>,
    items: { orderItemId: string; quantity: number }[],
  ) {
    const id = (await askReturn(order.number, items).expect(201)).body.data.id as string
    await adminPatch(`/returns/${id}/approve`, {
      note: 'Our courier collects it tomorrow.',
    }).expect(200)
    await adminPatch(`/returns/${id}/receive`, { items: [] }).expect(200)
    return id
  }
  const stockOf = async (variantId: string) =>
    (await db.productVariant.findUniqueOrThrow({ where: { id: variantId } })).stock

  beforeEach(async () => {
    await resetDatabase()
    await seedShippingZones()
    await db.setting.create({ data: { key: 'return_window_days', value: 7 } })
    app = await createTestApp({ asAdmin: false })
    admin = await createTestApp({ asAdmin: true })
    gateway = admin.get(PAYMENT_GATEWAY)
    rafi = await signUp(app, 'rafi@example.com', { fullName: 'Rafi Rahman' })
    const c = await makeCategory()
    shirt = (
      await makeProduct({
        categoryId: c.id,
        basePrice: '1490',
        variants: [{ size: 'M', color: 'Blue', stock: 20 }],
      })
    ).variants[0]!.id
    panjabi = (
      await makeProduct({
        categoryId: c.id,
        basePrice: '2490',
        variants: [{ size: '40', color: 'White', stock: 20 }],
      })
    ).variants[0]!.id
  })
  afterEach(async () => {
    await app.close()
    await admin.close()
  })

  describe('asking for a return', () => {
    it('eligibility: what can come back, and until when', async () => {
      const o = await deliveredOrder({ deliveredDaysAgo: 2 })
      const res = await as(rafi).get(`/returns/eligibility/${o.number}`).expect(200)
      expect(res.body.data).toMatchObject({
        canReturn: true,
        reason: null,
        items: [
          { orderItemId: o.shirtLine, bought: 2, returnable: 2 },
          { orderItemId: o.panjabiLine, bought: 1, returnable: 1 },
        ],
      })
      const closes = new Date(res.body.data.windowClosesAt).getTime()
      expect(Math.round((closes - Date.now()) / DAY)).toBe(5)
    })

    it('only delivered orders, only within return_window_days, and 0 switches returns off', async () => {
      const late = await deliveredOrder({ deliveredDaysAgo: 8 })
      const res = await askReturn(late.number, [
        { orderItemId: late.shirtLine, quantity: 1 },
      ]).expect(409)
      expect(res.body).toMatchObject({
        error: 'RETURN_NOT_POSSIBLE',
        message: expect.stringMatching(/^The return window for this order closed on /),
      })

      const notYet = await deliveredOrder()
      await db.order.update({
        where: { id: notYet.orderId },
        data: { status: 'SHIPPED', deliveredAt: null },
      })
      expect(
        (await as(rafi).get(`/returns/eligibility/${notYet.number}`).expect(200)).body.data,
      ).toMatchObject({
        canReturn: false,
        reason: 'Returns are possible once your order has been delivered.',
      })

      await db.setting.update({ where: { key: 'return_window_days' }, data: { value: 0 } })
      const fresh = await deliveredOrder()
      await askReturn(fresh.number, [{ orderItemId: fresh.shirtLine, quantity: 1 }]).expect(409)
    })

    it('never more than bought — counting earlier requests; a REJECTED request frees its items', async () => {
      const o = await deliveredOrder()
      await askReturn(o.number, [{ orderItemId: o.shirtLine, quantity: 3 }]).expect(409)
      const first = (
        await askReturn(o.number, [{ orderItemId: o.shirtLine, quantity: 1 }]).expect(201)
      ).body.data
      expect(first).toMatchObject({
        status: 'REQUESTED',
        reason: 'WRONG_SIZE',
        orderNumber: o.number,
      })
      await askReturn(o.number, [{ orderItemId: o.shirtLine, quantity: 2 }]).expect(409) // only 1 left
      await askReturn(o.number, [{ orderItemId: o.shirtLine, quantity: 1 }]).expect(201)
      const res = await askReturn(o.number, [{ orderItemId: o.shirtLine, quantity: 1 }]).expect(409)
      expect(res.body.message).toMatch(/has already been returned/)

      await adminPatch(`/returns/${first.id}/reject`, { reason: 'Worn — tags removed.' }).expect(
        200,
      )
      await askReturn(o.number, [{ orderItemId: o.shirtLine, quantity: 1 }]).expect(201) // freed
    })

    it("someone else's order, an item not in the order, a made-up reason → refused", async () => {
      const o = await deliveredOrder()
      const other = await signUp(app, 'other@example.com')
      await as(other)
        .post('/returns', {
          orderNumber: o.number,
          items: [{ orderItemId: o.shirtLine, quantity: 1 }],
          reason: 'WRONG_SIZE',
        })
        .expect(404)
      await askReturn(o.number, [{ orderItemId: randomUUID(), quantity: 1 }]).expect(404)
      await askReturn(o.number, [{ orderItemId: o.shirtLine, quantity: 1 }], {
        reason: 'FREE_MONEY',
      }).expect(400)
      await askReturn(o.number, []).expect(400)
    })

    it("the customer sees their returns, with the admin's instructions or reason", async () => {
      const o = await deliveredOrder()
      const { id } = (
        await askReturn(o.number, [{ orderItemId: o.panjabiLine, quantity: 1 }], {
          note: 'Too big.',
        }).expect(201)
      ).body.data
      await adminPatch(`/returns/${id}/approve`, {
        note: 'Our courier collects it tomorrow.',
      }).expect(200)
      const mine = await as(rafi).get('/returns/my').expect(200)
      expect(mine.body.data).toEqual([
        expect.objectContaining({
          id,
          status: 'APPROVED',
          customerNote: 'Too big.',
          adminNote: 'Our courier collects it tomorrow.',
          items: [
            expect.objectContaining({
              productName: expect.any(String),
              variantLabel: '40 / White',
              quantity: 1,
            }),
          ],
        }),
      ])
    })
  })

  describe('admin steps (approve / reject → receive)', () => {
    it('admin routes are locked without admin access', async () => {
      await http().get('/api/v1/returns').expect(401)
      await http().patch(`/api/v1/returns/${randomUUID()}/approve`).send({ note: 'x' }).expect(401)
      await http()
        .patch(`/api/v1/returns/${randomUUID()}/refund`)
        .send({ amount: '1', method: 'MANUAL' })
        .expect(401)
    })

    it("steps can't be skipped or repeated; approve needs instructions, reject a reason", async () => {
      const o = await deliveredOrder()
      const { id } = (
        await askReturn(o.number, [{ orderItemId: o.shirtLine, quantity: 1 }]).expect(201)
      ).body.data
      await adminPatch(`/returns/${id}/receive`, { items: [] }).expect(409) // not approved yet
      await adminPatch(`/returns/${id}/refund`, { amount: '100', method: 'MANUAL' }).expect(409)
      await adminPatch(`/returns/${id}/approve`, {}).expect(400)
      await adminPatch(`/returns/${id}/approve`, { note: 'Send it back with the courier.' }).expect(
        200,
      )
      const again = await adminPatch(`/returns/${id}/approve`, { note: 'again' }).expect(409)
      expect(again.body.error).toBe('RETURN_WRONG_STEP')
      await adminPatch(`/returns/${id}/reject`, { reason: 'x' }).expect(409) // too late to reject
    })

    it('receiving puts back on sale ONLY what is sellable — once', async () => {
      const o = await deliveredOrder()
      const before = { shirt: await stockOf(shirt), panjabi: await stockOf(panjabi) }
      const { id } = (
        await askReturn(o.number, [
          { orderItemId: o.shirtLine, quantity: 2 },
          { orderItemId: o.panjabiLine, quantity: 1 },
        ]).expect(201)
      ).body.data
      await adminPatch(`/returns/${id}/approve`, { note: 'ok' }).expect(200)
      expect(await stockOf(shirt)).toBe(before.shirt) // not at approval
      const res = await adminPatch(`/returns/${id}/receive`, {
        items: [{ orderItemId: o.panjabiLine, restock: false }], // came back damaged
      }).expect(200)
      expect(res.body.data.status).toBe('RECEIVED')
      expect(await stockOf(shirt)).toBe(before.shirt + 2)
      expect(await stockOf(panjabi)).toBe(before.panjabi)
      expect(await db.inventoryLog.count({ where: { reason: 'RETURN_RESTOCKED' } })).toBe(1)
      await adminPatch(`/returns/${id}/receive`, { items: [] }).expect(409)
      expect(await stockOf(shirt)).toBe(before.shirt + 2)
    })
  })

  describe('refunds', () => {
    it("the suggestion: the items' share of what was paid (discount and VAT shared out, no delivery)", async () => {
      await db.discountCode.create({
        data: { code: 'TEN', type: 'PERCENTAGE', value: new Prisma.Decimal(10) },
      })
      const o = await deliveredOrder({ discount: 'TEN' }) // 5470 − 547 + 60 = 4983
      const id = await receivedReturn(o, [{ orderItemId: o.shirtLine, quantity: 1 }])
      const view = (await adminGet(`/returns/${id}`).expect(200)).body.data
      // 1490 − 547 × (1490 / 5470) = 1490 − 149 = 1341
      expect(view).toMatchObject({
        suggestedRefund: '1341',
        maxRefundable: '4983',
        paymentMethod: 'COD',
      })
    })

    it('cash on delivery: recorded by hand; never more than is left; statuses update', async () => {
      const o = await deliveredOrder()
      const id = await receivedReturn(o, [{ orderItemId: o.shirtLine, quantity: 1 }])
      const tooMuch = await adminPatch(`/returns/${id}/refund`, {
        amount: '5530.01',
        method: 'MANUAL',
      }).expect(422)
      expect(tooMuch.body.error).toBe('REFUND_TOO_LARGE')
      await adminPatch(`/returns/${id}/refund`, { amount: '1490', method: 'GATEWAY' }).expect(409) // not paid online
      const res = await adminPatch(`/returns/${id}/refund`, {
        amount: '1490',
        method: 'MANUAL',
        reference: 'bKash TrxID 8N7A6K',
      }).expect(200)
      expect(res.body.data).toMatchObject({
        status: 'REFUNDED',
        refundAmount: '1490',
        maxRefundable: '4040',
      })
      const order = await db.order.findUniqueOrThrow({
        where: { id: o.orderId },
        include: { payments: true },
      })
      expect(order).toMatchObject({ status: 'DELIVERED', paymentStatus: 'PARTIALLY_REFUNDED' })
      expect(order.payments[0]!.status).toBe('PARTIALLY_REFUNDED')
      expect(gateway.refunds).toEqual([]) // SSLCommerz never involved
    })

    it('everything back and refunded in full → the order is RETURNED and REFUNDED', async () => {
      const o = await deliveredOrder()
      const id = await receivedReturn(o, [
        { orderItemId: o.shirtLine, quantity: 2 },
        { orderItemId: o.panjabiLine, quantity: 1 },
      ])
      await adminPatch(`/returns/${id}/refund`, { amount: '5530', method: 'MANUAL' }).expect(200)
      const order = await db.order.findUniqueOrThrow({
        where: { id: o.orderId },
        include: { statusHistory: true },
      })
      expect(order).toMatchObject({ status: 'RETURNED', paymentStatus: 'REFUNDED' })
      expect(order.statusHistory.at(-1)).toMatchObject({ toStatus: 'RETURNED' })
    })

    it('paid online: refunded through SSLCommerz with our references', async () => {
      const o = await deliveredOrder({ method: 'SSLCOMMERZ' })
      const id = await receivedReturn(o, [{ orderItemId: o.panjabiLine, quantity: 1 }])
      const res = await adminPatch(`/returns/${id}/refund`, {
        amount: '2490',
        method: 'GATEWAY',
      }).expect(200)
      expect(res.body.data).toMatchObject({
        status: 'REFUNDED',
        refunds: [{ status: 'PROCESSED', gatewayRefId: 'RREF-1' }],
      })
      expect(gateway.refunds).toEqual([
        expect.objectContaining({
          bankTransactionId: 'BANK-1',
          refundTransactionId: expect.stringMatching(/^RF10001-[0-9A-F]{6}$/),
          amount: '2490',
          reference: res.body.data.refunds[0].id,
        }),
      ])
    })

    it('"processing" → settled later by reconcile', async () => {
      const o = await deliveredOrder({ method: 'SSLCOMMERZ' })
      const id = await receivedReturn(o, [{ orderItemId: o.panjabiLine, quantity: 1 }])
      gateway.refundAnswer = 'processing'
      const res = await adminPatch(`/returns/${id}/refund`, {
        amount: '2490',
        method: 'GATEWAY',
      }).expect(200)
      expect(res.body.data).toMatchObject({
        status: 'RECEIVED',
        refunds: [{ status: 'PENDING', gatewayRefId: 'RREF-1' }],
      })
      await adminPatch(`/returns/${id}/refund`, { amount: '1', method: 'GATEWAY' }).expect(409) // already in progress

      const refunds = admin.get(RefundsService)
      expect(await refunds.reconcile()).toBe(0) // still processing
      gateway.refundStatuses.set('RREF-1', 'REFUNDED')
      expect(await refunds.reconcile()).toBe(1)
      expect((await adminGet(`/returns/${id}`)).body.data).toMatchObject({
        status: 'REFUNDED',
        refunds: [{ status: 'PROCESSED' }],
      })
    })

    it('SSLCommerz refuses → FAILED, nothing reserved, trying again works', async () => {
      const o = await deliveredOrder({ method: 'SSLCOMMERZ' })
      const id = await receivedReturn(o, [{ orderItemId: o.panjabiLine, quantity: 1 }])
      gateway.refundAnswer = 'failed'
      const res = await adminPatch(`/returns/${id}/refund`, {
        amount: '2490',
        method: 'GATEWAY',
      }).expect(502)
      expect(res.body.error).toBe('REFUND_REFUSED')
      expect((await adminGet(`/returns/${id}`)).body.data).toMatchObject({
        maxRefundable: '5530',
        refunds: [{ status: 'FAILED' }],
      })
      gateway.refundAnswer = 'refunded'
      await adminPatch(`/returns/${id}/refund`, { amount: '2490', method: 'GATEWAY' }).expect(200)
    })

    it("SSLCommerz doesn't answer → stays PENDING (unknown), blocks another try, admin resolves it", async () => {
      const o = await deliveredOrder({ method: 'SSLCOMMERZ' })
      const id = await receivedReturn(o, [{ orderItemId: o.panjabiLine, quantity: 1 }])
      gateway.refundAnswer = 'unreachable'
      const res = await adminPatch(`/returns/${id}/refund`, {
        amount: '2490',
        method: 'GATEWAY',
      }).expect(200)
      const refund = res.body.data.refunds[0]
      expect(refund).toMatchObject({ status: 'PENDING', gatewayRefId: null })
      expect(res.body.data.maxRefundable).toBe('3040') // still counted: it may have gone through
      gateway.refundAnswer = 'refunded'
      await adminPatch(`/returns/${id}/refund`, { amount: '2490', method: 'GATEWAY' }).expect(409) // no double refund
      expect(gateway.refunds).toHaveLength(1)

      await adminPatch(`/returns/${id}/refunds/${refund.id}/resolve`, {
        outcome: 'REFUNDED',
        note: 'Seen in the SSLCommerz panel.',
      }).expect(200)
      expect((await adminGet(`/returns/${id}`)).body.data.status).toBe('REFUNDED')
      await adminPatch(`/returns/${id}/refunds/${refund.id}/resolve`, {
        outcome: 'FAILED',
        note: 'x',
      }).expect(409)
    })
  })
})
