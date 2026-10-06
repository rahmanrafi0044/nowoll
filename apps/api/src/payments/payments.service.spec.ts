// Online payments against the REAL test database and a FAKE SSLCommerz
// (test/utils/fake-payment-gateway.ts). Every rule from the step 20 plan has
// a test here — above all: nothing an IPN or redirect claims is believed.
import { randomUUID } from 'node:crypto'
import { makeCategory, makeProduct, seedShippingZones } from '../../test/utils/factories.js'
import { FakePaymentGateway } from '../../test/utils/fake-payment-gateway.js'
import {
  makePaymentsService,
  makeStockService,
  RecordingOrderNotifier,
} from '../../test/utils/services.js'
import { resetDatabase, testPrisma } from '../../test/utils/test-db.js'
import { CheckoutService } from '../checkout/checkout.service.js'
import { DiscountsService } from '../discounts/discounts.service.js'
import type { CreateOrderDto } from '../orders/dto/create-order.dto.js'
import { OrderExpiryService } from '../orders/order-expiry.service.js'
import { OrdersService } from '../orders/orders.service.js'
import type { PrismaService } from '../prisma/prisma.service.js'
import { SettingsService } from '../settings/settings.service.js'
import { ShippingService } from '../shipping/shipping.service.js'
import { paidValId, PaymentsService } from './payments.service.js'

const prisma = testPrisma() as unknown as PrismaService
const discounts = new DiscountsService(prisma)
const settings = new SettingsService(prisma)
const checkout = new CheckoutService(prisma, discounts, new ShippingService(prisma), settings)
const { stock } = makeStockService(prisma)

let gateway: FakePaymentGateway
let notifier: RecordingOrderNotifier
let payments: PaymentsService
let orders: OrdersService
let expiry: OrderExpiryService

beforeEach(async () => {
  await resetDatabase()
  await seedShippingZones()
  ;({ payments, gateway, notifier } = makePaymentsService(prisma))
  orders = new OrdersService(prisma, checkout, discounts, stock, payments, notifier)
  expiry = new OrderExpiryService(prisma, orders, settings, payments)
})
afterAll(() => prisma.$disconnect())

const minutesFromNow = (m: number) => new Date(Date.now() + m * 60_000)

async function shirt(stockLevel = 5) {
  const c = await makeCategory()
  const p = await makeProduct({
    categoryId: c.id,
    basePrice: '1490',
    variants: [{ size: 'M', color: 'Blue', stock: stockLevel }],
  })
  return p.variants[0]!
}

const dto = (
  variantId: string,
  paymentMethod: CreateOrderDto['paymentMethod'] = 'SSLCOMMERZ',
): CreateOrderDto => ({
  items: [{ variantId, quantity: 1 }],
  contact: { fullName: 'Rafi Rahman', email: 'rafi@example.com', phone: '+8801712345678' },
  address: {
    division: 'Dhaka',
    district: 'Dhaka',
    area: 'Dhanmondi',
    addressLine1: 'House 12, Road 5',
  },
  paymentMethod,
  expectedTotal: '1550', // 1490 + 60 shipping inside Dhaka
})

/** Places an online order for one shirt; returns its id and the shirt. */
async function onlineOrder(stockLevel = 5) {
  const v = await shirt(stockLevel)
  const placed = await orders.create(dto(v.id), randomUUID())
  return { orderId: placed.orderId, variantId: v.id }
}

/** Places an online order and presses "Pay" once; returns the tran_id sent to SSLCommerz. */
async function startedPayment(stockLevel = 5) {
  const o = await onlineOrder(stockLevel)
  await payments.init(o.orderId)
  return { ...o, tranId: gateway.created.at(-1)!.transactionId }
}

const orderOf = (id: string) =>
  prisma.order.findUniqueOrThrow({
    where: { id },
    include: { payments: { orderBy: { createdAt: 'asc' } }, statusHistory: true },
  })
const paymentOf = (transactionId: string) =>
  prisma.payment.findUniqueOrThrow({ where: { transactionId } })
const stockOf = async (id: string) =>
  (await prisma.productVariant.findUniqueOrThrow({ where: { id } })).stock

describe('init — "Pay now"', () => {
  it('the first Pay sends the attempt created with the order, with the right details', async () => {
    const { orderId } = await onlineOrder()
    const before = await orderOf(orderId)

    const { redirectUrl } = await payments.init(orderId)

    const sent = gateway.created[0]!
    expect(sent).toMatchObject({
      transactionId: before.payments[0]!.transactionId, // reused, not a new attempt
      amount: '1550',
      customer: {
        name: 'Rafi Rahman',
        email: 'rafi@example.com',
        phone: '+8801712345678',
        address: 'House 12, Road 5, Dhanmondi',
        city: 'Dhaka',
        postcode: null,
      },
      productNames: [expect.any(String)],
      itemCount: 1,
      urls: {
        success: 'https://api.nowoll.test/api/v1/payment/sslcommerz/success',
        fail: 'https://api.nowoll.test/api/v1/payment/sslcommerz/fail',
        cancel: 'https://api.nowoll.test/api/v1/payment/sslcommerz/cancel',
        ipn: 'https://api.nowoll.test/api/v1/payment/sslcommerz/ipn',
      },
    })
    expect(redirectUrl).toBe(`https://sandbox.sslcommerz.com/pay/${sent.transactionId}`)
    const after = await orderOf(orderId)
    expect(after.payments).toHaveLength(1)
    expect(after.payments[0]!.initiatedAt).toBeInstanceOf(Date)
  })

  it('"Try paying again" sends a NEW tran_id; the old attempt stays valid', async () => {
    const { orderId, tranId } = await startedPayment()
    await payments.init(orderId)

    const second = gateway.created[1]!.transactionId
    expect(second).not.toBe(tranId)
    expect(second).toMatch(/^NW10001-[0-9A-F]{6}$/)
    const { payments: attempts } = await orderOf(orderId)
    expect(attempts.map((p) => [p.transactionId, p.status])).toEqual([
      [tranId, 'PENDING'],
      [second, 'PENDING'],
    ])
  })

  it('two Pay clicks at the same moment never send the same tran_id twice', async () => {
    const { orderId } = await onlineOrder()
    await Promise.all([payments.init(orderId), payments.init(orderId), payments.init(orderId)])
    const sent = gateway.created.map((c) => c.transactionId)
    expect(new Set(sent).size).toBe(3)
    expect((await orderOf(orderId)).payments).toHaveLength(3)
  })

  it('refuses cash-on-delivery, paid, under-review, expired and cancelled orders', async () => {
    const v = await shirt(10)
    const cod = await orders.create(dto(v.id, 'COD'), randomUUID())
    await expect(payments.init(cod.orderId)).rejects.toMatchObject({
      response: { code: 'NOT_AN_ONLINE_ORDER' },
    })

    const paid = await orders.create(dto(v.id), randomUUID())
    await prisma.order.update({
      where: { id: paid.orderId },
      data: { status: 'CONFIRMED', paymentStatus: 'PAID' },
    })
    await expect(payments.init(paid.orderId)).rejects.toMatchObject({
      response: { code: 'ALREADY_PAID' },
    })

    const review = await orders.create(dto(v.id), randomUUID())
    await prisma.order.update({
      where: { id: review.orderId },
      data: { paymentStatus: 'UNDER_REVIEW' },
    })
    await expect(payments.init(review.orderId)).rejects.toMatchObject({
      response: { code: 'PAYMENT_UNDER_REVIEW' },
    })

    const old = await orders.create(dto(v.id), randomUUID())
    await expect(payments.init(old.orderId, minutesFromNow(31))).rejects.toMatchObject({
      response: { code: 'ORDER_EXPIRED' },
    })

    const cancelled = await orders.create(dto(v.id), randomUUID())
    await orders.cancel(cancelled.orderId, { reason: 'test' })
    await expect(payments.init(cancelled.orderId)).rejects.toMatchObject({
      response: { code: 'ORDER_EXPIRED' },
    })
    expect(gateway.created).toHaveLength(0)
  })

  it('a gateway refusal is reported; the attempt counts as sent (it reached SSLCommerz)', async () => {
    const { orderId } = await onlineOrder()
    gateway.createResult = { ok: false, reason: 'GATEWAY_REFUSED', message: 'Store is inactive' }
    await expect(payments.init(orderId)).rejects.toMatchObject({
      status: 502,
      response: { code: 'PAYMENT_GATEWAY_REFUSED', message: 'Store is inactive' },
    })
    expect((await orderOf(orderId)).payments[0]!.initiatedAt).not.toBeNull()
  })

  it('when nothing reached SSLCommerz, the attempt is kept for the next try', async () => {
    const { orderId } = await onlineOrder()
    gateway.createResult = { ok: false, reason: 'NOT_CONFIGURED', message: 'Not set up' }
    await expect(payments.init(orderId)).rejects.toMatchObject({ status: 503 })
    expect((await orderOf(orderId)).payments[0]!.initiatedAt).toBeNull()
  })
})

describe('placing an online order', () => {
  it('is refused when online payment is not set up (the order would hold stock for nothing)', async () => {
    const offline = new PaymentsService(
      prisma,
      settings,
      gateway,
      {
        apiPublicUrl: 'https://api.nowoll.test',
        siteUrl: 'https://nowoll.test',
        onlineEnabled: false,
      },
      new RecordingOrderNotifier(),
    )
    const strictOrders = new OrdersService(prisma, checkout, discounts, stock, offline, notifier)
    const v = await shirt(5)
    await expect(strictOrders.create(dto(v.id), randomUUID())).rejects.toMatchObject({
      response: { code: 'ONLINE_PAYMENT_UNAVAILABLE' },
    })
    expect(await stockOf(v.id)).toBe(5)
    await expect(strictOrders.create(dto(v.id, 'COD'), randomUUID())).resolves.toBeDefined()
  })

  it('knows the SSLCommerz amount limits (৳10 – ৳5,00,000)', () => {
    expect(payments.onlinePaymentProblem('9.99')?.code).toBe('ONLINE_PAYMENT_AMOUNT')
    expect(payments.onlinePaymentProblem('500000.01')?.code).toBe('ONLINE_PAYMENT_AMOUNT')
    expect(payments.onlinePaymentProblem('10')).toBeNull()
  })
})

describe('IPN — SSLCommerz says a payment happened', () => {
  it('a validated payment confirms the order, records the details and the audit trail', async () => {
    const { orderId, tranId } = await startedPayment()
    const valId = gateway.pay(tranId, '1550.00')

    await payments.handleIpn({ tran_id: tranId, val_id: valId, status: 'VALID', amount: '1550.00' })

    const order = await orderOf(orderId)
    expect(order).toMatchObject({ status: 'CONFIRMED', paymentStatus: 'PAID' })
    expect(order.confirmedAt).toBeInstanceOf(Date)
    expect(order.statusHistory.map((h) => h.toStatus)).toEqual(['PENDING', 'CONFIRMED'])
    expect(await paymentOf(tranId)).toMatchObject({
      status: 'PAID',
      valId,
      bankTransactionId: `BANK-${valId}`,
      cardType: 'BKASH-BKash',
    })
    const events = await prisma.paymentEvent.findMany({ orderBy: { createdAt: 'asc' } })
    expect(events.map((e) => e.type)).toEqual(['IPN', 'VALIDATION'])
    expect(events[0]!.payload).toMatchObject({ tran_id: tranId, status: 'VALID' })
  })

  it('a confirmed payment announces "payment confirmed" ONCE (→ the email job); risky ones don\'t', async () => {
    const { tranId } = await startedPayment()
    const ipn = { tran_id: tranId, val_id: gateway.pay(tranId, '1550') }
    await payments.handleIpn(ipn)
    await payments.handleIpn(ipn) // retried IPN
    await payments.handleRedirect('success', ipn)
    expect(notifier.paid).toEqual([{ orderId: expect.any(String), orderNumber: 10001 }])

    const risky = await startedPayment()
    await payments.handleIpn({
      tran_id: risky.tranId,
      val_id: gateway.pay(risky.tranId, '1550', { risky: true }),
    })
    expect(notifier.paid).toHaveLength(1) // under review: no "payment received" email
  })

  it('the same payment reported twice (IPN + redirect, or a retried IPN) is applied once', async () => {
    const { orderId, tranId } = await startedPayment()
    const valId = gateway.pay(tranId, '1550')
    const ipn = { tran_id: tranId, val_id: valId, status: 'VALID' }

    await Promise.all([payments.handleIpn(ipn), payments.handleRedirect('success', ipn)])
    await payments.handleIpn(ipn)

    const order = await orderOf(orderId)
    expect(order.statusHistory.filter((h) => h.toStatus === 'CONFIRMED')).toHaveLength(1)
    expect(order.paymentStatus).toBe('PAID')
  })

  it('FORGED: "status=VALID" with a made-up val_id changes nothing', async () => {
    const { orderId, tranId } = await startedPayment()
    await payments.handleIpn({ tran_id: tranId, val_id: 'FAKE-123', status: 'VALID' })
    await payments.handleIpn({ tran_id: tranId, status: 'VALID', amount: '1550.00' }) // no val_id at all

    expect(await orderOf(orderId)).toMatchObject({ status: 'PENDING', paymentStatus: 'PENDING' })
    expect((await paymentOf(tranId)).status).toBe('PENDING')
    expect(gateway.statusCalls).toEqual([tranId, tranId]) // asked SSLCommerz; it knows nothing of it
  })

  it("FORGED: another order's real val_id can't pay for this order", async () => {
    const a = await startedPayment(10)
    const v = await shirt(5)
    const b = await orders.create(dto(v.id), randomUUID())
    await payments.init(b.orderId)
    const valIdOfA = gateway.pay(a.tranId, '1550')
    const tranIdOfB = gateway.created.at(-1)!.transactionId

    await payments.handleIpn({ tran_id: tranIdOfB, val_id: valIdOfA, status: 'VALID' })

    expect((await orderOf(b.orderId)).paymentStatus).toBe('PENDING')
    expect((await orderOf(a.orderId)).paymentStatus).toBe('PENDING') // not settled through B's IPN either
  })

  it('a payment of the wrong amount does not count', async () => {
    const { orderId, tranId } = await startedPayment()
    const valId = gateway.pay(tranId, '15.50')
    await payments.handleIpn({ tran_id: tranId, val_id: valId, status: 'VALID' })
    expect((await orderOf(orderId)).paymentStatus).toBe('PENDING')
  })

  it('an IPN for an unknown transaction is stored and ignored', async () => {
    await payments.handleIpn({ tran_id: 'NW99999-ABCDEF', val_id: 'x', status: 'VALID' })
    await payments.handleIpn({ status: 'VALID' })
    const events = await prisma.paymentEvent.findMany()
    expect(events.map((e) => [e.type, e.paymentId, e.transactionId])).toEqual(
      expect.arrayContaining([
        ['IPN', null, 'NW99999-ABCDEF'],
        ['IPN', null, null],
      ]),
    )
    expect(gateway.verifyCalls).toEqual([])
  })

  it('RISKY: paid but flagged → under review, not confirmed, and never auto-cancelled', async () => {
    await prisma.setting.create({ data: { key: 'payment_timeout_minutes', value: 30 } })
    const { orderId, tranId } = await startedPayment()
    const valId = gateway.pay(tranId, '1550', { risky: true })

    await payments.handleIpn({ tran_id: tranId, val_id: valId })

    const order = await orderOf(orderId)
    expect(order).toMatchObject({ status: 'PENDING', paymentStatus: 'UNDER_REVIEW' })
    expect(order.adminNotes).toMatch(/Card holder verification — check before shipping/)
    expect(await paymentOf(tranId)).toMatchObject({ status: 'UNDER_REVIEW', valId })
    expect(await expiry.expireUnpaidOrders(minutesFromNow(120))).toBe(0)
  })

  it('DUPLICATE: paid in two tabs → confirmed once; the second payment is flagged for a refund', async () => {
    const { orderId, tranId: first } = await startedPayment()
    await payments.init(orderId)
    const second = gateway.created[1]!.transactionId

    await payments.handleIpn({ tran_id: first, val_id: gateway.pay(first, '1550') })
    await payments.handleIpn({ tran_id: second, val_id: gateway.pay(second, '1550') })

    const order = await orderOf(orderId)
    expect(order).toMatchObject({ status: 'CONFIRMED', paymentStatus: 'PAID' })
    expect(order.statusHistory.filter((h) => h.toStatus === 'CONFIRMED')).toHaveLength(1)
    expect((await paymentOf(first)).status).toBe('PAID')
    expect((await paymentOf(second)).status).toBe('UNDER_REVIEW')
    expect(order.adminNotes).toMatch(new RegExp(`${second}: duplicate payment`))
  })

  it('LATE: paid after the order was cancelled → order stays cancelled, payment flagged', async () => {
    const { orderId, tranId, variantId } = await startedPayment(5)
    await orders.cancel(orderId, { reason: 'Online payment not completed within 30 minutes' })
    expect(await stockOf(variantId)).toBe(5)

    await payments.handleIpn({ tran_id: tranId, val_id: gateway.pay(tranId, '1550') })

    const order = await orderOf(orderId)
    expect(order).toMatchObject({ status: 'CANCELLED', paymentStatus: 'UNDER_REVIEW' })
    expect(order.adminNotes).toMatch(/paid after the order was cancelled/)
    expect(await paymentOf(tranId)).toMatchObject({ status: 'UNDER_REVIEW' })
    expect(await stockOf(variantId)).toBe(5) // the shirt is NOT silently taken again
  })

  it('UNREACHABLE validator: never guessed — under review, then resolved by reconcile', async () => {
    const { orderId, tranId } = await startedPayment()
    const valId = gateway.pay(tranId, '1550')
    gateway.validatorDown = true

    await payments.handleIpn({ tran_id: tranId, val_id: valId })
    expect(await orderOf(orderId)).toMatchObject({
      status: 'PENDING',
      paymentStatus: 'UNDER_REVIEW',
    })
    expect(await paymentOf(tranId)).toMatchObject({ status: 'UNDER_REVIEW', valId: null })

    expect(await payments.reconcile()).toBe(0) // still down: nothing changes
    gateway.validatorDown = false
    expect(await payments.reconcile()).toBe(1)
    expect(await orderOf(orderId)).toMatchObject({ status: 'CONFIRMED', paymentStatus: 'PAID' })
  })

  it('reconcile: an unverifiable "payment" SSLCommerz never saw goes back to unpaid', async () => {
    const { orderId, tranId } = await startedPayment()
    gateway.validatorDown = true
    await payments.handleIpn({ tran_id: tranId, val_id: 'FORGED-DURING-OUTAGE' })
    expect((await orderOf(orderId)).paymentStatus).toBe('UNDER_REVIEW')

    gateway.validatorDown = false
    gateway.setState(tranId, 'FAILED')
    expect(await payments.reconcile()).toBe(1)

    expect(await orderOf(orderId)).toMatchObject({ status: 'PENDING', paymentStatus: 'PENDING' })
    expect((await paymentOf(tranId)).status).toBe('FAILED')
  })
})

describe('redirects — the customer coming back from SSLCommerz', () => {
  it('success with a real payment → thank-you page, and the order is already confirmed', async () => {
    const { orderId, tranId } = await startedPayment()
    const url = await payments.handleRedirect('success', {
      tran_id: tranId,
      val_id: gateway.pay(tranId, '1550'),
    })
    expect(url).toBe(`https://nowoll.test/checkout/success?order=${orderId}`)
    expect((await orderOf(orderId)).paymentStatus).toBe('PAID')
  })

  it('"success" with a forged val_id → the payment-failed page, order untouched', async () => {
    const { orderId, tranId } = await startedPayment()
    const url = await payments.handleRedirect('success', { tran_id: tranId, val_id: 'FAKE' })
    expect(url).toBe(`https://nowoll.test/checkout/payment-failed?order=${orderId}&reason=fail`)
    expect((await orderOf(orderId)).paymentStatus).toBe('PENDING')
  })

  it('fail: the attempt is marked FAILED only once SSLCommerz confirms; the order stays open', async () => {
    const { orderId, tranId } = await startedPayment()

    gateway.setState(tranId, 'PENDING') // SSLCommerz: still in progress
    expect(await payments.handleRedirect('fail', { tran_id: tranId, status: 'FAILED' })).toBe(
      `https://nowoll.test/checkout/payment-failed?order=${orderId}&reason=fail`,
    )
    expect((await paymentOf(tranId)).status).toBe('PENDING')

    gateway.setState(tranId, 'FAILED')
    await payments.handleRedirect('cancel', { tran_id: tranId })
    expect((await paymentOf(tranId)).status).toBe('FAILED')
    expect(await orderOf(orderId)).toMatchObject({ status: 'PENDING', paymentStatus: 'PENDING' })
    expect((await payments.status(orderId)).canRetry).toBe(true)
  })

  it('"fail" for a payment SSLCommerz says WAS paid → settled as paid', async () => {
    const { orderId, tranId } = await startedPayment()
    gateway.pay(tranId, '1550')
    await payments.handleRedirect('fail', { tran_id: tranId })
    expect((await orderOf(orderId)).paymentStatus).toBe('PAID')
  })

  it('an unknown transaction → back to checkout with an error', async () => {
    expect(await payments.handleRedirect('success', { tran_id: 'nope' })).toBe(
      'https://nowoll.test/checkout?payment=error',
    )
  })
})

describe('the unpaid-order sweep asks SSLCommerz first (decision #4)', () => {
  beforeEach(() =>
    prisma.setting.create({ data: { key: 'payment_timeout_minutes', value: 30 } }).then(() => {}),
  )
  const sweepLater = () => expiry.expireUnpaidOrders(minutesFromNow(45))

  it('a paid order whose IPN got lost is confirmed, not cancelled', async () => {
    const { orderId, tranId } = await startedPayment()
    gateway.pay(tranId, '1550') // paid — but no IPN ever arrives
    expect(await sweepLater()).toBe(0)
    expect(await orderOf(orderId)).toMatchObject({ status: 'CONFIRMED', paymentStatus: 'PAID' })
  })

  it('SSLCommerz not answering → the order waits for the next round', async () => {
    const { orderId } = await startedPayment()
    gateway.queryDown = true
    expect(await sweepLater()).toBe(0)
    expect((await orderOf(orderId)).status).toBe('PENDING')

    gateway.queryDown = false
    expect(await sweepLater()).toBe(1)
    expect((await orderOf(orderId)).status).toBe('CANCELLED')
  })

  it('an order whose customer pressed Pay recently is not cancelled mid-payment', async () => {
    const { orderId } = await onlineOrder()
    await prisma.order.update({ where: { id: orderId }, data: { createdAt: minutesFromNow(-29) } })
    await payments.init(orderId) // "Pay" at minute 29
    expect(await expiry.expireUnpaidOrders(minutesFromNow(5))).toBe(0)
    expect(await expiry.expireUnpaidOrders(minutesFromNow(31))).toBe(1)
  })

  it('never-sent attempts need no question — the order is simply cancelled', async () => {
    await onlineOrder()
    expect(await sweepLater()).toBe(1)
    expect(gateway.statusCalls).toEqual([])
  })
})

describe('status — what the thank-you page shows', () => {
  it('reports the payment state and whether "Try again" can still work', async () => {
    const { orderId, tranId } = await startedPayment()
    expect(await payments.status(orderId)).toMatchObject({
      displayNumber: 'NW-10001',
      status: 'PENDING',
      paymentStatus: 'PENDING',
      canRetry: true,
    })
    expect((await payments.status(orderId, minutesFromNow(31))).canRetry).toBe(false)

    await payments.handleIpn({ tran_id: tranId, val_id: gateway.pay(tranId, '1550') })
    expect(await payments.status(orderId)).toMatchObject({
      status: 'CONFIRMED',
      paymentStatus: 'PAID',
      canRetry: false,
    })
  })

  it('404 for an unknown order', async () => {
    await expect(payments.status(randomUUID())).rejects.toMatchObject({ status: 404 })
  })
})

describe('paidValId', () => {
  it('finds the val_id of a VALID/VALIDATED transaction, else null', () => {
    expect(
      paidValId({
        element: [
          { status: 'FAILED', val_id: 'a' },
          { status: 'VALIDATED', val_id: 'b' },
        ],
      }),
    ).toBe('b')
    expect(paidValId({ element: [{ status: 'PENDING', val_id: 'a' }] })).toBeNull()
    expect(paidValId({ no_of_trans_found: 0 })).toBeNull()
    expect(paidValId(null)).toBeNull()
  })
})
