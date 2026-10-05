// The most important tests in the project: placing orders against the REAL
// test database, including simultaneous orders racing for the same stock.
import { randomUUID } from 'node:crypto'
import { Prisma } from '@nowoll/database'
import {
  makeCategory,
  makeDiscount,
  makeProduct,
  seedShippingZones,
} from '../../test/utils/factories.js'
import { makeStockService } from '../../test/utils/services.js'
import { resetDatabase, testPrisma } from '../../test/utils/test-db.js'
import { CheckoutService } from '../checkout/checkout.service.js'
import { DiscountsService } from '../discounts/discounts.service.js'
import type { PrismaService } from '../prisma/prisma.service.js'
import { SettingsService } from '../settings/settings.service.js'
import { ShippingService } from '../shipping/shipping.service.js'
import type { CreateOrderDto } from './dto/create-order.dto.js'
import { OrderExpiryService } from './order-expiry.service.js'
import { OrdersService, stockLockOrder } from './orders.service.js'

const prisma = testPrisma() as unknown as PrismaService
const discounts = new DiscountsService(prisma)
const settings = new SettingsService(prisma)
const checkout = new CheckoutService(prisma, discounts, new ShippingService(prisma), settings)
const placedEvents: unknown[] = []
const notifier = { orderPlaced: async (e: unknown) => void placedEvents.push(e) }
const { stock } = makeStockService(prisma)
const orders = new OrdersService(prisma, checkout, discounts, stock, notifier)
const expiry = new OrderExpiryService(prisma, orders, settings)

beforeEach(async () => {
  await resetDatabase()
  placedEvents.length = 0
  await seedShippingZones()
})
afterAll(() => prisma.$disconnect())

async function shirt(stockLevel = 5, price = '1490') {
  const c = await makeCategory()
  const p = await makeProduct({
    categoryId: c.id,
    basePrice: price,
    variants: [{ size: 'M', color: 'Blue', stock: stockLevel }],
  })
  return p.variants[0]!
}

const dto = (
  items: { variantId: string; quantity: number }[],
  overrides: Partial<CreateOrderDto> = {},
): CreateOrderDto => ({
  items,
  contact: { fullName: 'Rafi Rahman', email: 'rafi@example.com', phone: '+8801712345678' },
  address: {
    division: 'Dhaka',
    district: 'Dhaka',
    area: 'Dhanmondi',
    addressLine1: 'House 12, Road 5',
  },
  paymentMethod: 'COD',
  expectedTotal: '1550',
  ...overrides,
})
const stockOf = async (id: string) =>
  (await prisma.productVariant.findUniqueOrThrow({ where: { id } })).stock

describe('OrdersService.create — the happy path', () => {
  it('places a COD order: NW-10001, everything copied, stock taken, payment record, history', async () => {
    const v = await shirt(5)
    const placed = await orders.create(dto([{ variantId: v.id, quantity: 1 }]), randomUUID())

    expect(placed).toMatchObject({
      orderNumber: 10001,
      displayNumber: 'NW-10001',
      status: 'PENDING',
      paymentStatus: 'PENDING',
      nextAction: 'NONE',
    })
    expect(placed.total.toString()).toBe('1550')

    const order = await prisma.order.findUniqueOrThrow({
      where: { id: placed.orderId },
      include: { items: true, payments: true, statusHistory: true, inventoryLogs: true },
    })
    expect(order).toMatchObject({
      customerName: 'Rafi Rahman',
      email: 'rafi@example.com',
      phone: '+8801712345678',
      shippingDistrict: 'Dhaka',
      shippingZoneName: 'Inside Dhaka',
    })
    expect([order.subtotal, order.shippingFee, order.total].map(String)).toEqual([
      '1490',
      '60',
      '1550',
    ])
    expect(order.items[0]).toMatchObject({ variantLabel: 'M / Blue', quantity: 1 })
    expect(order.items[0]!.unitPrice.toString()).toBe('1490')
    expect(order.payments).toEqual([
      expect.objectContaining({ method: 'COD', status: 'PENDING', transactionId: order.id }),
    ])
    expect(order.statusHistory).toEqual([
      expect.objectContaining({ toStatus: 'PENDING', note: 'Order placed' }),
    ])
    expect(order.inventoryLogs).toEqual([
      expect.objectContaining({ change: -1, reason: 'ORDER_PLACED' }),
    ])
    expect(await stockOf(v.id)).toBe(4)
    expect(placedEvents).toHaveLength(1)
  })

  it('an online order asks the storefront to send the customer to pay', async () => {
    const v = await shirt()
    const placed = await orders.create(
      dto([{ variantId: v.id, quantity: 1 }], { paymentMethod: 'SSLCOMMERZ' }),
      randomUUID(),
    )
    expect(placed.nextAction).toBe('PAY')
  })

  it('applies and counts a discount code', async () => {
    const v = await shirt()
    await makeDiscount({ code: 'SAVE10' })
    const placed = await orders.create(
      dto([{ variantId: v.id, quantity: 1 }], { discountCode: 'save10', expectedTotal: '1401' }),
      randomUUID(),
    )
    const order = await prisma.order.findUniqueOrThrow({
      where: { id: placed.orderId },
      include: { discountUsage: true },
    })
    expect(order).toMatchObject({ discountCode: 'SAVE10' })
    expect(order.discountAmount.toString()).toBe('149')
    expect(order.discountUsage).toMatchObject({ email: 'rafi@example.com' })
  })
})

describe('OrdersService.create — all or nothing', () => {
  async function nothingSaved(...variants: { id: string; stock: number }[]) {
    expect(await prisma.order.count()).toBe(0)
    expect(await prisma.payment.count()).toBe(0)
    for (const v of variants) expect(await stockOf(v.id)).toBe(v.stock)
  }

  it('if the second item sold out, the first item is NOT taken either', async () => {
    const a = await shirt(5)
    const b = await shirt(1)
    await makeDiscount({ code: 'SAVE10' })
    await expect(
      orders.create(
        dto(
          [
            { variantId: a.id, quantity: 2 },
            { variantId: b.id, quantity: 2 },
          ],
          { discountCode: 'SAVE10', expectedTotal: '5424' },
        ),
        randomUUID(),
      ),
    ).rejects.toMatchObject({ response: { code: 'OUT_OF_STOCK' } })
    await nothingSaved({ id: a.id, stock: 5 }, { id: b.id, stock: 1 })
    expect(
      (await prisma.discountCode.findUniqueOrThrow({ where: { code: 'SAVE10' } })).usedCount,
    ).toBe(0)
  })

  it('refuses if the total changed since the customer reviewed it (decision #5)', async () => {
    const v = await shirt(5)
    await expect(
      orders.create(
        dto([{ variantId: v.id, quantity: 1 }], { expectedTotal: '1450' }),
        randomUUID(),
      ),
    ).rejects.toMatchObject({
      response: { code: 'PRICE_CHANGED', message: expect.stringContaining('৳1550') },
    })
    await nothingSaved({ id: v.id, stock: 5 })
  })

  it("refuses a discount code that can't be used (instead of silently dropping it)", async () => {
    const v = await shirt(5)
    await makeDiscount({ code: 'BIG', minOrderAmount: new Prisma.Decimal(9000) })
    await expect(
      orders.create(dto([{ variantId: v.id, quantity: 1 }], { discountCode: 'BIG' }), randomUUID()),
    ).rejects.toMatchObject({
      response: { code: 'DISCOUNT_MIN_ORDER' },
    })
    await nothingSaved({ id: v.id, stock: 5 })
  })

  it('refuses a district that is not in the chosen division', async () => {
    const v = await shirt()
    await expect(
      orders.create(
        dto([{ variantId: v.id, quantity: 1 }], {
          address: { division: 'Dhaka', district: 'Sylhet', addressLine1: 'x' },
        }),
        randomUUID(),
      ),
    ).rejects.toThrow(/Sylhet is not in Dhaka/)
  })
})

describe('OrdersService.create — double submits and races', () => {
  it('the same key twice returns the SAME order (double tap / retry)', async () => {
    const v = await shirt(5)
    const key = randomUUID()
    const first = await orders.create(dto([{ variantId: v.id, quantity: 1 }]), key)
    const second = await orders.create(dto([{ variantId: v.id, quantity: 1 }]), key)
    expect(second.orderId).toBe(first.orderId)
    expect(await prisma.order.count()).toBe(1)
    expect(await stockOf(v.id)).toBe(4)
  })

  it('the same key 5 times AT ONCE still creates exactly one order', async () => {
    const v = await shirt(5)
    const key = randomUUID()
    const results = await Promise.all(
      Array.from({ length: 5 }, () => orders.create(dto([{ variantId: v.id, quantity: 1 }]), key)),
    )
    expect(new Set(results.map((r) => r.orderId)).size).toBe(1)
    expect(await prisma.order.count()).toBe(1)
    expect(await stockOf(v.id)).toBe(4)
  })

  it('10 customers racing for the last 3 shirts: exactly 3 orders, stock 0, never negative', async () => {
    const v = await shirt(3)
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () =>
        orders.create(dto([{ variantId: v.id, quantity: 1 }]), randomUUID()),
      ),
    )
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(3)
    expect(await prisma.order.count()).toBe(3)
    expect(await prisma.payment.count()).toBe(3)
    expect(await stockOf(v.id)).toBe(0)
  })

  it('orders for {A, B} and {B, A} at the same time never deadlock', async () => {
    const a = await shirt(50)
    const b = await shirt(50)
    const ab = [
      { variantId: a.id, quantity: 1 },
      { variantId: b.id, quantity: 1 },
    ]
    const ba = [...ab].reverse()
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, (_, i) =>
        orders.create(dto(i % 2 ? ab : ba, { expectedTotal: '3040' }), randomUUID()),
      ),
    )
    const failures = results
      .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
      .map((r) => String(r.reason))
    expect(failures).toEqual([])
    expect([await stockOf(a.id), await stockOf(b.id)]).toEqual([42, 42])
  })
})

describe('OrdersService.cancel', () => {
  it('puts stock back, returns the discount use, cancels the payment, records why', async () => {
    const v = await shirt(5)
    await makeDiscount({ code: 'ONCE', usageLimit: 1 })
    const placed = await orders.create(
      dto([{ variantId: v.id, quantity: 2 }], { discountCode: 'ONCE', expectedTotal: '2742' }),
      randomUUID(),
    )
    expect(await stockOf(v.id)).toBe(3)

    await expect(
      orders.cancel(placed.orderId, { reason: 'Customer called to cancel' }),
    ).resolves.toEqual({ cancelled: true })
    const order = await prisma.order.findUniqueOrThrow({
      where: { id: placed.orderId },
      include: { payments: true, statusHistory: { orderBy: { createdAt: 'asc' } } },
    })
    expect(order).toMatchObject({
      status: 'CANCELLED',
      paymentStatus: 'CANCELLED',
      cancelReason: 'Customer called to cancel',
    })
    expect(order.payments[0]!.status).toBe('CANCELLED')
    expect(order.statusHistory.at(-1)).toMatchObject({
      fromStatus: 'PENDING',
      toStatus: 'CANCELLED',
    })
    expect(await stockOf(v.id)).toBe(5)
    expect(
      (await prisma.discountCode.findUniqueOrThrow({ where: { code: 'ONCE' } })).usedCount,
    ).toBe(0)

    // safe to repeat: nothing is restored twice
    await expect(orders.cancel(placed.orderId, { reason: 'again' })).resolves.toEqual({
      cancelled: false,
    })
    expect(await stockOf(v.id)).toBe(5)
  })

  it('refuses to cancel a shipped order', async () => {
    const v = await shirt(5)
    const placed = await orders.create(dto([{ variantId: v.id, quantity: 1 }]), randomUUID())
    await prisma.order.update({ where: { id: placed.orderId }, data: { status: 'SHIPPED' } })
    await expect(orders.cancel(placed.orderId, { reason: 'x' })).rejects.toThrow(
      /shipped and can't be cancelled/,
    )
  })
})

describe('OrderExpiryService — unpaid online orders (decision #2)', () => {
  const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000)

  it('cancels online orders unpaid after the timeout, and nothing else', async () => {
    await prisma.setting.create({ data: { key: 'payment_timeout_minutes', value: 30 } })
    const v = await shirt(10)
    const make = async (paymentMethod: 'COD' | 'SSLCOMMERZ', ageMinutes: number) => {
      const p = await orders.create(
        dto([{ variantId: v.id, quantity: 1 }], { paymentMethod }),
        randomUUID(),
      )
      await prisma.order.update({
        where: { id: p.orderId },
        data: { createdAt: minutesAgo(ageMinutes) },
      })
      return p.orderId
    }
    const staleOnline = await make('SSLCOMMERZ', 45)
    const freshOnline = await make('SSLCOMMERZ', 10)
    const oldCod = await make('COD', 600)
    const paidOnline = await make('SSLCOMMERZ', 45)
    await prisma.order.update({
      where: { id: paidOnline },
      data: { paymentStatus: 'PAID', status: 'CONFIRMED' },
    })
    expect(await stockOf(v.id)).toBe(6)

    expect(await expiry.expireUnpaidOrders(new Date())).toBe(1)
    const status = async (id: string) =>
      (await prisma.order.findUniqueOrThrow({ where: { id } })).status
    expect([
      await status(staleOnline),
      await status(freshOnline),
      await status(oldCod),
      await status(paidOnline),
    ]).toEqual(['CANCELLED', 'PENDING', 'PENDING', 'CONFIRMED'])
    expect(await stockOf(v.id)).toBe(7) // the stale order's shirt is back on sale
  })

  it('a payment that is confirmed at the last moment wins over the sweep', async () => {
    const v = await shirt(5)
    const p = await orders.create(
      dto([{ variantId: v.id, quantity: 1 }], { paymentMethod: 'SSLCOMMERZ' }),
      randomUUID(),
    )
    await prisma.order.update({
      where: { id: p.orderId },
      data: { paymentStatus: 'PAID', status: 'CONFIRMED' },
    })
    await expect(
      orders.cancel(p.orderId, { reason: 'timeout', onlyIfUnpaid: true }),
    ).resolves.toEqual({ cancelled: false })
    expect(await stockOf(v.id)).toBe(4)
  })
})

describe('deadlock prevention', () => {
  it('stockLockOrder always gives the same order, whatever order the bag is in', () => {
    const ab = [{ variantId: 'b-2' }, { variantId: 'a-1' }, { variantId: 'c-3' }]
    expect(stockLockOrder(ab).map((l) => l.variantId)).toEqual(['a-1', 'b-2', 'c-3'])
    expect(stockLockOrder([...ab].reverse()).map((l) => l.variantId)).toEqual(['a-1', 'b-2', 'c-3'])
  })

  // WHY it matters, shown deterministically with two hand-driven transactions.
  async function race(firstOrder: string[], secondOrder: string[]) {
    const lock = (tx: Prisma.TransactionClient, id: string) =>
      tx.$executeRaw`UPDATE product_variants SET stock = stock - 1 WHERE id = ${id}::uuid`
    let releaseFirst!: () => void
    let firstHolds!: () => void
    const firstHolding = new Promise<void>((r) => (firstHolds = r))
    const first = prisma.$transaction(
      async (tx) => {
        await lock(tx, firstOrder[0]!)
        firstHolds()
        await new Promise<void>((r) => (releaseFirst = r))
        await lock(tx, firstOrder[1]!)
      },
      { timeout: 20_000 },
    )
    await firstHolding
    const second = prisma.$transaction(
      async (tx) => {
        await lock(tx, secondOrder[0]!)
        await lock(tx, secondOrder[1]!)
      },
      { timeout: 20_000 },
    )
    await new Promise((r) => setTimeout(r, 300)) // let the second take its first lock (or start waiting)
    releaseFirst()
    return Promise.allSettled([first, second])
  }

  it('opposite lock orders deadlock — Postgres aborts one transaction', async () => {
    const [a, b] = [await shirt(10), await shirt(10)]
    const results = await race([a.id, b.id], [b.id, a.id])
    const errors = results
      .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
      .map((r) => String(r.reason))
    expect(errors.some((e) => /deadlock/i.test(e))).toBe(true)
  })

  it('the same lock order never deadlocks — the second simply waits its turn', async () => {
    const [a, b] = [await shirt(10), await shirt(10)]
    const results = await race([a.id, b.id], [a.id, b.id])
    expect(results.map((r) => r.status)).toEqual(['fulfilled', 'fulfilled'])
  })
})
