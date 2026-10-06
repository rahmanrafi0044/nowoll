// The lock that stops two refunds from together paying back more than was
// paid — proven deterministically (like addresses.service.spec.ts): we hold a
// lock on the payment row and check that a refund WAITS for it.
//
// We hold FOR NO KEY UPDATE, not FOR UPDATE: inserting a refund makes Postgres
// check its payment exists (foreign key, a light FOR KEY SHARE lock). FOR
// UPDATE would block that check too, so the refund would wait even without
// the service's own lock and this test would prove nothing.
import { randomUUID } from 'node:crypto'
import { Prisma } from '@nowoll/database'
import { FakePaymentGateway } from '../../test/utils/fake-payment-gateway.js'
import { makeStockService } from '../../test/utils/services.js'
import { resetDatabase, testPrisma } from '../../test/utils/test-db.js'
import type { PrismaService } from '../prisma/prisma.service.js'
import { SettingsService } from '../settings/settings.service.js'
import { RefundsService } from './refunds.service.js'
import { ReturnsService, suggestedRefund } from './returns.service.js'

const prisma = testPrisma() as unknown as PrismaService
const { stock } = makeStockService(prisma)
const returns = new ReturnsService(prisma, new SettingsService(prisma), stock)
const gateway = new FakePaymentGateway()
const refunds = new RefundsService(prisma, returns, gateway)

beforeEach(() => resetDatabase())
afterAll(() => prisma.$disconnect())

/** A paid, delivered ৳1000 order with a RECEIVED return of its one item. */
async function receivedReturn() {
  const user = await prisma.user.create({ data: { id: randomUUID(), email: 'rafi@example.com' } })
  const order = await prisma.order.create({
    data: {
      userId: user.id,
      status: 'DELIVERED',
      paymentMethod: 'SSLCOMMERZ',
      paymentStatus: 'PAID',
      email: 'rafi@example.com',
      phone: '+8801712345678',
      customerName: 'Rafi',
      shippingAddressLine1: 'House 1',
      shippingDistrict: 'Dhaka',
      shippingDivision: 'Dhaka',
      shippingZoneName: 'Inside Dhaka',
      subtotal: new Prisma.Decimal(1000),
      total: new Prisma.Decimal(1000),
      items: {
        create: {
          productName: 'Shirt',
          variantLabel: 'M',
          sku: 'S',
          unitPrice: new Prisma.Decimal(1000),
          quantity: 1,
          lineTotal: new Prisma.Decimal(1000),
        },
      },
      payments: {
        create: {
          method: 'SSLCOMMERZ',
          status: 'PAID',
          amount: new Prisma.Decimal(1000),
          transactionId: `NW1-${randomUUID().slice(0, 6)}`,
          bankTransactionId: 'BANK-1',
        },
      },
    },
    include: { items: true, payments: true },
  })
  const ret = await prisma.returnRequest.create({
    data: {
      orderId: order.id,
      userId: user.id,
      reason: 'WRONG_SIZE',
      status: 'RECEIVED',
      items: { create: { orderItemId: order.items[0]!.id, quantity: 1 } },
    },
  })
  return { returnId: ret.id, paymentId: order.payments[0]!.id }
}

it("a refund waits while another refund holds the payment's lock", async () => {
  const { returnId, paymentId } = await receivedReturn()
  let release!: () => void
  const held = new Promise<void>((r) => (release = r))
  let locked!: () => void
  const lockTaken = new Promise<void>((r) => (locked = r))
  const holder = prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM payments WHERE id = ${paymentId}::uuid FOR NO KEY UPDATE`
      locked()
      await held
    },
    { timeout: 10_000 },
  )
  await lockTaken

  // An ONLINE refund that SSLCommerz answers "processing": that path touches
  // the payment row ONLY through the service's lock. (A manual refund also
  // updates the payment's status at the end — which would wait on our lock
  // even without the service's, and prove nothing: a mutation check caught that.)
  gateway.refundAnswer = 'processing'
  let finished = false
  const refund = refunds
    .refund(returnId, { amount: '1000', method: 'GATEWAY' })
    .then(() => (finished = true))
  await new Promise((r) => setTimeout(r, 400))
  expect(finished).toBe(false) // waiting — never checking "how much is left" alongside another refund

  release()
  await holder
  await refund
  expect(finished).toBe(true)
})

describe('suggestedRefund', () => {
  const d = (n: number | string) => new Prisma.Decimal(n)
  const order = { subtotal: d(5470), discountAmount: d(547), vatAmount: d(0) }

  it("shares the discount out by the items' value", () => {
    expect(
      suggestedRefund(order, [{ quantity: 1, orderItem: { unitPrice: d(1490) } }]).toString(),
    ).toBe('1341')
  })

  it('adds the VAT share, rounded to the poisha', () => {
    const withVat = { subtotal: d(1000), discountAmount: d(0), vatAmount: d(75) }
    expect(
      suggestedRefund(withVat, [{ quantity: 1, orderItem: { unitPrice: d(333) } }]).toString(),
    ).toBe('357.98') // 333 + 24.975
  })

  it('everything returned = everything paid except delivery', () => {
    const full = [
      { quantity: 2, orderItem: { unitPrice: d(1490) } },
      { quantity: 1, orderItem: { unitPrice: d(2490) } },
    ]
    expect(suggestedRefund(order, full).toString()).toBe('4923') // 5470 − 547
  })
})
