// Real-database tests (nowoll_test), including simultaneous orders racing for a code.
import { Prisma } from '@nowoll/database'
import { makeCategory, makeDiscount, makeOrder, makeProduct } from '../../test/utils/factories.js'
import { resetDatabase, testPrisma } from '../../test/utils/test-db.js'
import type { PrismaService } from '../prisma/prisma.service.js'
import { DiscountsService } from './discounts.service.js'

const prisma = testPrisma() as unknown as PrismaService
const service = new DiscountsService(prisma)
const D = (v: string | number) => new Prisma.Decimal(v)

beforeEach(() => resetDatabase())
afterAll(() => prisma.$disconnect())

async function cart(price = '1490', quantity = 1) {
  const c = await makeCategory()
  const p = await makeProduct({ categoryId: c.id, basePrice: price })
  return [{ variantId: p.variants[0]!.id, quantity }]
}

const redeem = (code: string, email = 'a@example.com', subtotal = '1000') =>
  makeOrder({ email }).then((order) =>
    prisma.$transaction((tx) =>
      service.redeem(tx, { code, orderId: order.id, email, subtotal: D(subtotal) }),
    ),
  )

describe('DiscountsService.preview', () => {
  it('prices the bag from the database and applies the code (rounded down to whole taka)', async () => {
    const items = await cart('1341.5', 2) // ৳2,683
    await makeDiscount({ code: 'SAVE10' })
    const p = await service.preview({ code: 'save10', items })
    expect([
      p.code,
      p.subtotal.toString(),
      p.discountAmount.toString(),
      p.subtotalAfterDiscount.toString(),
    ]).toEqual(['SAVE10', '2683', '268', '2415'])
  })

  it('refuses items that are no longer for sale', async () => {
    const items = await cart()
    await prisma.productVariant.update({
      where: { id: items[0]!.variantId },
      data: { isActive: false },
    })
    await makeDiscount({ code: 'SAVE10' })
    await expect(service.preview({ code: 'SAVE10', items })).rejects.toMatchObject({
      response: { code: 'ITEMS_UNAVAILABLE' },
    })
  })

  it('checks the per-customer limit only when an email is given', async () => {
    const items = await cart()
    const code = await makeDiscount({ code: 'ONCE', usageLimitPerCustomer: 1 })
    const order = await makeOrder({ email: 'rafi@example.com' })
    await prisma.discountUsage.create({
      data: {
        discountCodeId: code.id,
        orderId: order.id,
        email: 'rafi@example.com',
        amount: D(100),
      },
    })

    await expect(service.preview({ code: 'ONCE', items })).resolves.toBeDefined()
    await expect(
      service.preview({ code: 'ONCE', items, email: 'RAFI@example.com' }),
    ).rejects.toMatchObject({
      response: { code: 'DISCOUNT_CUSTOMER_LIMIT', message: "You've already used this code." },
    })
  })

  it('never counts a use (preview only)', async () => {
    const items = await cart()
    await makeDiscount({ code: 'SAVE10', usageLimit: 1 })
    await service.preview({ code: 'SAVE10', items })
    await service.preview({ code: 'SAVE10', items })
    expect(
      (await prisma.discountCode.findUniqueOrThrow({ where: { code: 'SAVE10' } })).usedCount,
    ).toBe(0)
  })
})

describe('DiscountsService.redeem / release', () => {
  it('counts the use and records who used it and how much it saved', async () => {
    await makeDiscount({ code: 'SAVE10' })
    const result = await redeem('save10', 'Rafi@Example.com', '1490')
    expect(result.amount.toString()).toBe('149')
    const code = await prisma.discountCode.findUniqueOrThrow({
      where: { code: 'SAVE10' },
      include: { usages: true },
    })
    expect(code.usedCount).toBe(1)
    expect(code.usages[0]).toMatchObject({ email: 'rafi@example.com' })
  })

  it('applies the same rules as the preview (e.g. minimum order)', async () => {
    await makeDiscount({ code: 'BIG', minOrderAmount: D(2000) })
    await expect(redeem('BIG', 'a@example.com', '1999')).rejects.toMatchObject({
      response: { code: 'DISCOUNT_MIN_ORDER' },
    })
    expect(
      (await prisma.discountCode.findUniqueOrThrow({ where: { code: 'BIG' } })).usedCount,
    ).toBe(0)
  })

  it('10 simultaneous orders for a code with 3 uses left: exactly 3 succeed', async () => {
    await makeDiscount({ code: 'LAST3', usageLimit: 3 })
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, (_, i) => redeem('LAST3', `c${i}@example.com`)),
    )
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(3)
    const code = await prisma.discountCode.findUniqueOrThrow({
      where: { code: 'LAST3' },
      include: { usages: true },
    })
    expect([code.usedCount, code.usages.length]).toEqual([3, 3])
  })

  it('one customer racing 5 orders with a once-per-customer code: exactly 1 succeeds', async () => {
    await makeDiscount({ code: 'ONCE', usageLimitPerCustomer: 1 })
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => redeem('ONCE', 'same@example.com')),
    )
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    const code = await prisma.discountCode.findUniqueOrThrow({
      where: { code: 'ONCE' },
      include: { usages: true },
    })
    expect([code.usedCount, code.usages.length]).toEqual([1, 1])
  })

  it('a second order by the same customer WAITS for the first, then sees its use (deterministic, no luck)', async () => {
    await makeDiscount({ code: 'ONCE', usageLimitPerCustomer: 1 })
    const [orderA, orderB] = [await makeOrder(), await makeOrder()]
    const input = (orderId: string) => ({
      code: 'ONCE',
      orderId,
      email: 'same@example.com',
      subtotal: D(1000),
    })

    // Order A redeems, then is held open (not committed) until we say so.
    let finishA!: () => void
    let aRedeemed!: () => void
    const aHasRedeemed = new Promise<void>((r) => (aRedeemed = r))
    const a = prisma.$transaction(
      async (tx) => {
        await service.redeem(tx, input(orderA.id))
        aRedeemed()
        await new Promise<void>((r) => (finishA = r))
      },
      { timeout: 15_000 },
    )
    await aHasRedeemed

    // Order B starts while A is still open: it must wait on A's lock.
    let bSettled = false
    const b = prisma
      .$transaction((tx) => service.redeem(tx, input(orderB.id)), { timeout: 15_000 })
      .finally(() => (bSettled = true))
    await new Promise((r) => setTimeout(r, 500))
    expect(bSettled).toBe(false)

    // A commits → B continues, sees A's use, and is refused.
    finishA()
    await a
    await expect(b).rejects.toMatchObject({ response: { code: 'DISCOUNT_CUSTOMER_LIMIT' } })
    expect(await prisma.discountUsage.count()).toBe(1)
  })

  it('release gives the use back (payment failed / order cancelled)', async () => {
    await makeDiscount({ code: 'ONCE', usageLimit: 1, usageLimitPerCustomer: 1 })
    const order = await makeOrder({ email: 'a@example.com' })
    await prisma.$transaction((tx) =>
      service.redeem(tx, {
        code: 'ONCE',
        orderId: order.id,
        email: 'a@example.com',
        subtotal: D(1000),
      }),
    )
    await prisma.$transaction((tx) => service.release(tx, order.id))

    const code = await prisma.discountCode.findUniqueOrThrow({
      where: { code: 'ONCE' },
      include: { usages: true },
    })
    expect([code.usedCount, code.usages.length]).toEqual([0, 0])
    await expect(redeem('ONCE', 'a@example.com')).resolves.toBeDefined() // usable again
    await expect(
      prisma.$transaction((tx) => service.release(tx, order.id)),
    ).resolves.toBeUndefined() // idempotent
  })

  it('a rolled-back order leaves no trace of the use', async () => {
    await makeDiscount({ code: 'SAVE10', usageLimit: 1 })
    const order = await makeOrder()
    await expect(
      prisma.$transaction(async (tx) => {
        await service.redeem(tx, {
          code: 'SAVE10',
          orderId: order.id,
          email: 'a@example.com',
          subtotal: D(1000),
        })
        throw new Error('payment record failed')
      }),
    ).rejects.toThrow()
    expect(
      (await prisma.discountCode.findUniqueOrThrow({ where: { code: 'SAVE10' } })).usedCount,
    ).toBe(0)
  })
})

describe('DiscountsService admin rules', () => {
  const base = { code: 'EID26', type: 'PERCENTAGE' as const, value: 20 }

  it('creates codes in upper case and refuses duplicates (including archived ones)', async () => {
    const c = await service.create({ ...base, code: 'EID26' })
    await expect(service.create(base)).rejects.toThrow(/already exists/)
    await service.remove(c.id)
    await expect(service.create(base)).rejects.toThrow(/archived/)
  })

  it.each([
    ['percentage over 100', { value: 150 }, /at most 100/],
    [
      'a cap on a fixed code',
      { type: 'FIXED_AMOUNT' as const, value: 200, maxDiscountAmount: 100 },
      /only applies to PERCENTAGE/,
    ],
    [
      'end before start',
      { startsAt: new Date('2026-12-01'), expiresAt: new Date('2026-11-01') },
      /after startsAt/,
    ],
  ])('refuses %s', async (_label, extra, message) => {
    await expect(service.create({ ...base, ...extra })).rejects.toThrow(message)
  })

  it('locks code text and type once used, but allows other edits (decision #6)', async () => {
    const c = await service.create(base)
    await prisma.discountCode.update({ where: { id: c.id }, data: { usedCount: 1 } })
    await expect(service.update(c.id, { code: 'EID27' })).rejects.toThrow(/can't change/)
    await expect(service.update(c.id, { type: 'FIXED_AMOUNT' })).rejects.toThrow(/can't change/)
    expect((await service.update(c.id, { value: 25, usageLimit: 500 })).value.toString()).toBe('25')
  })

  it('lists codes with how much each has discounted in total', async () => {
    const c = await service.create(base)
    for (const amount of [100, 250]) {
      const order = await makeOrder()
      await prisma.discountUsage.create({
        data: { discountCodeId: c.id, orderId: order.id, email: 'x@y.com', amount: D(amount) },
      })
    }
    const page = await service.list({ page: 1, pageSize: 50 })
    expect(page.items[0]!.totalDiscounted.toString()).toBe('350')
  })
})
