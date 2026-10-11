// Reading orders back without an account (step 21), against the real test DB.
import { randomUUID } from 'node:crypto'
import { makeCategory, makeProduct, seedShippingZones } from '../../test/utils/factories.js'
import { makePaymentsService, makeStockService } from '../../test/utils/services.js'
import { resetDatabase, testPrisma } from '../../test/utils/test-db.js'
import { CheckoutService } from '../checkout/checkout.service.js'
import { DiscountsService } from '../discounts/discounts.service.js'
import type { PaymentsService } from '../payments/payments.service.js'
import type { PrismaService } from '../prisma/prisma.service.js'
import { SettingsService } from '../settings/settings.service.js'
import { ShippingService } from '../shipping/shipping.service.js'
import type { CreateOrderDto } from './dto/create-order.dto.js'
import { OrderLookupService, parseContact, parseOrderNumber } from './order-lookup.service.js'
import { OrdersService } from './orders.service.js'

const prisma = testPrisma() as unknown as PrismaService
const discounts = new DiscountsService(prisma)
const settings = new SettingsService(prisma)
const checkout = new CheckoutService(
  prisma,
  discounts,
  new ShippingService(prisma),
  settings,
  // Only asked whether online payment is set up on the server (step 38c).
  { onlineConfigured: () => true } as unknown as PaymentsService,
)
const { stock } = makeStockService(prisma)
const { payments } = makePaymentsService(prisma)
const orders = new OrdersService(prisma, checkout, discounts, stock, payments, {
  orderPlaced: async () => {},
  paymentConfirmed: async () => {},
})
const lookup = new OrderLookupService(prisma, payments)

beforeEach(async () => {
  await resetDatabase()
  await seedShippingZones()
})
afterAll(() => prisma.$disconnect())

async function place(paymentMethod: CreateOrderDto['paymentMethod'] = 'COD') {
  const c = await makeCategory()
  const p = await makeProduct({
    categoryId: c.id,
    basePrice: '1490',
    variants: [{ size: 'M', color: 'Blue', stock: 5 }],
  })
  const placed = await orders.create(
    {
      items: [{ variantId: p.variants[0]!.id, quantity: 1 }],
      contact: { fullName: 'Rafi Rahman', email: 'rafi@example.com', phone: '+8801712345678' },
      address: {
        division: 'Dhaka',
        district: 'Dhaka',
        area: 'Dhanmondi',
        addressLine1: 'House 12, Road 5',
        postalCode: '1209',
      },
      paymentMethod,
      expectedTotal: '1550',
    },
    randomUUID(),
  )
  return placed.orderId
}

describe('parseOrderNumber', () => {
  it.each([
    ['NW-10001', 10001],
    ['nw10001', 10001],
    [' NW 10001 ', 10001],
    ['10001', 10001],
    ['NW-', null],
    ['10001; DROP TABLE', null],
    ['AB-10001', null],
  ])('%s → %s', (input, expected) => expect(parseOrderNumber(input)).toBe(expected))
})

describe('parseContact', () => {
  it('reads an email (any case) or a mobile number (any common format)', () => {
    expect(parseContact(' Rafi@Example.com ')).toEqual({ email: 'rafi@example.com' })
    expect(parseContact('017 1234-5678')).toEqual({ phone: '+8801712345678' })
    expect(parseContact('+8801712345678')).toEqual({ phone: '+8801712345678' })
    expect(parseContact('not-an-email@')).toBeNull()
    expect(parseContact('12345')).toBeNull()
  })
})

describe('receipt — the confirmation page', () => {
  it('has everything the customer needs: items, totals, full address', async () => {
    const id = await place()
    const r = await lookup.receipt(id)
    expect(r).toMatchObject({
      orderId: id,
      displayNumber: 'NW-10001',
      status: 'PENDING',
      paymentMethod: 'COD',
      paymentStatus: 'PENDING',
      customerName: 'Rafi Rahman',
      deliveryAddress: {
        addressLine1: 'House 12, Road 5',
        addressLine2: null,
        area: 'Dhanmondi',
        district: 'Dhaka',
        division: 'Dhaka',
        postalCode: '1209',
      },
      deliveryZone: 'Inside Dhaka',
      canPay: false,
    })
    expect(r.items).toEqual([
      // sku: the same id as the catalog feed and tracking events (step 39a)
      expect.objectContaining({ variantLabel: 'M / Blue', quantity: 1, sku: expect.any(String) }),
    ])
    expect(r.items[0]!.lineTotal.toString()).toBe('1490')
    expect(r.totals.shippingFee.toString()).toBe('60')
    expect(r.totals.total.toString()).toBe('1550')
  })

  it('an unpaid online order can still be paid from it', async () => {
    const id = await place('SSLCOMMERZ')
    expect((await lookup.receipt(id)).canPay).toBe(true)
  })

  it('404 for an unknown id', async () => {
    await expect(lookup.receipt(randomUUID())).rejects.toMatchObject({ status: 404 })
  })
})

describe('track — the public "Track your order" form', () => {
  it('finds the order by number + email OR phone, in any common format', async () => {
    await place()
    for (const contact of [
      'rafi@example.com',
      'RAFI@example.com',
      '01712345678',
      '+880 1712-345678',
    ]) {
      const t = await lookup.track({ orderNumber: 'nw-10001', contact })
      expect(t.displayNumber).toBe('NW-10001')
    }
  })

  it('a wrong contact and a missing order give the SAME answer', async () => {
    await place()
    const wrongEmail = await lookup
      .track({ orderNumber: 'NW-10001', contact: 'someone@else.com' })
      .catch((e: unknown) => e)
    const noOrder = await lookup
      .track({ orderNumber: 'NW-99999', contact: 'rafi@example.com' })
      .catch((e: unknown) => e)
    expect(wrongEmail).toMatchObject({ status: 404 })
    expect(noOrder).toMatchObject({ status: 404 })
    expect((wrongEmail as Error).message).toBe((noOrder as Error).message)
  })

  it('never reveals the street address, notes or cancel reasons', async () => {
    const id = await place()
    await prisma.order.update({
      where: { id },
      data: { adminNotes: 'SECRET ADMIN NOTE' },
    })
    await orders.cancel(id, { reason: 'SECRET CANCEL REASON' })

    const t = await lookup.track({ orderNumber: '10001', contact: 'rafi@example.com' })
    const text = JSON.stringify(t)
    expect(text).not.toMatch(/House 12|1209|SECRET|Rafi Rahman|"orderId"/)
    expect(t.deliveryArea).toEqual({ area: 'Dhanmondi', district: 'Dhaka', division: 'Dhaka' })
    expect(t.payOrderId).toBeNull()
  })

  it('timeline: when the order first reached each status; courier once shipped', async () => {
    const id = await place()
    const at = (minutes: number) => new Date(Date.UTC(2026, 9, 5, 10, minutes))
    await prisma.orderStatusHistory.updateMany({
      where: { orderId: id },
      data: { createdAt: at(0) },
    })
    await prisma.orderStatusHistory.createMany({
      data: [
        { orderId: id, fromStatus: 'PENDING', toStatus: 'CONFIRMED', createdAt: at(5) },
        { orderId: id, fromStatus: 'CONFIRMED', toStatus: 'PROCESSING', createdAt: at(10) },
        { orderId: id, fromStatus: 'PROCESSING', toStatus: 'CONFIRMED', createdAt: at(12) }, // back a step
        { orderId: id, fromStatus: 'CONFIRMED', toStatus: 'SHIPPED', createdAt: at(20) },
      ],
    })
    await prisma.order.update({
      where: { id },
      data: { status: 'SHIPPED', courierName: 'Steadfast', trackingNumber: 'SF123456' },
    })

    const t = await lookup.track({ orderNumber: 'NW-10001', contact: '01712345678' })
    expect(t.timeline).toEqual([
      { status: 'PENDING', at: at(0) },
      { status: 'CONFIRMED', at: at(5) }, // the FIRST time, not the later step back
      { status: 'PROCESSING', at: at(10) },
      { status: 'SHIPPED', at: at(20) },
    ])
    expect(t).toMatchObject({ courierName: 'Steadfast', trackingNumber: 'SF123456' })
  })

  it('an unpaid online order gets "Pay now" (its id), only while payable', async () => {
    const id = await place('SSLCOMMERZ')
    const t = await lookup.track({ orderNumber: 'NW-10001', contact: 'rafi@example.com' })
    expect(t).toMatchObject({ canPay: true, payOrderId: id })

    await prisma.order.update({
      where: { id },
      data: { status: 'CONFIRMED', paymentStatus: 'PAID' },
    })
    const paid = await lookup.track({ orderNumber: 'NW-10001', contact: 'rafi@example.com' })
    expect(paid).toMatchObject({ canPay: false, payOrderId: null })
  })

  it('400 for input that is not an order number / email / phone', async () => {
    await expect(
      lookup.track({ orderNumber: 'hello', contact: 'rafi@example.com' }),
    ).rejects.toMatchObject({
      status: 400,
    })
    await expect(lookup.track({ orderNumber: 'NW-10001', contact: '12345' })).rejects.toMatchObject(
      {
        status: 400,
      },
    )
  })
})
