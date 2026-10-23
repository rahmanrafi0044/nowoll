import { RecordingEmailSender } from '@nowoll/email'
import { Prisma } from '@nowoll/database'
import { UnrecoverableError } from 'bullmq'
import { db, resetDatabase } from '../test/db.js'
import { type Deps, handleNotificationJob } from './handle-job.js'

// 38f "Notify me when it's back" — the worker side (docs/workers.md).
let sender: RecordingEmailSender
let deps: Deps
beforeEach(async () => {
  await resetDatabase()
  sender = new RecordingEmailSender()
  deps = { db, sender, siteUrl: 'https://nowoll.com/' }
})
afterAll(() => db.$disconnect())

async function sizeWithWaiters(stock = 5, emails = ['a@example.com', 'b@example.com']) {
  const category = await db.category.create({ data: { name: 'Women', slug: 'women' } })
  const product = await db.product.create({
    data: {
      name: 'Mehr Three-Piece',
      slug: 'mehr-three-piece',
      categoryId: category.id,
      basePrice: new Prisma.Decimal(1890),
      status: 'ACTIVE',
      variants: { create: { sku: 'MEHR-M', size: 'M', color: 'Ivory', stock } },
    },
    include: { variants: true },
  })
  const variant = product.variants[0]!
  for (const email of emails) await db.stockAlert.create({ data: { variantId: variant.id, email } })
  return { product, variant }
}

const job = (variantId: string) => ({
  id: `back-in-stock_${variantId}_1`,
  name: 'back-in-stock' as const,
  data: { variantId },
})

describe('back-in-stock emails (38f)', () => {
  it('emails everyone waiting once, with the product, size, price and link', async () => {
    const { variant } = await sizeWithWaiters()
    expect(await handleNotificationJob(job(variant.id), deps)).toBe('sent back-in-stock to 2')
    expect(sender.sent.map((e) => e.to)).toEqual(['a@example.com', 'b@example.com'])
    const [first] = sender.sent
    expect(first).toMatchObject({
      subject: 'Back in stock: Mehr Three-Piece (M / Ivory)',
      tag: 'back-in-stock',
      idempotencyKey: expect.stringMatching(/^back-in-stock_.+_.+$/),
    })
    expect(first!.text).toContain('M / Ivory')
    expect(first!.text).toContain('৳1,890')
    expect(first!.html).toContain('href="https://nowoll.com/products/mehr-three-piece"')
    // Each person gets a different Idempotency-Key.
    expect(new Set(sender.sent.map((e) => e.idempotencyKey)).size).toBe(2)

    // Run again (BullMQ retry, or a second restock): nobody is emailed twice.
    expect(await handleNotificationJob(job(variant.id), deps)).toBe('skipped: nobody waiting')
    expect(sender.sent).toHaveLength(2)
  })

  it('sold out again (or no longer for sale) by the time the job runs → nothing sent', async () => {
    const { variant, product } = await sizeWithWaiters(0)
    expect(await handleNotificationJob(job(variant.id), deps)).toBe(
      'skipped: not in stock or not for sale',
    )
    await db.productVariant.update({ where: { id: variant.id }, data: { stock: 3 } })
    await db.product.update({ where: { id: product.id }, data: { status: 'DRAFT' } })
    expect(await handleNotificationJob(job(variant.id), deps)).toBe(
      'skipped: not in stock or not for sale',
    )
    expect(sender.sent).toEqual([])
    expect(await db.stockAlert.count({ where: { notifiedAt: null } })).toBe(2) // still waiting
  })

  it('email service down → try again later; a refused address is not retried forever', async () => {
    const { variant } = await sizeWithWaiters()
    sender.failWith = { ok: false, retryable: true, reason: 'Resend is down' }
    await expect(handleNotificationJob(job(variant.id), deps)).rejects.toThrow('Resend is down')
    expect(await db.stockAlert.count({ where: { notifiedAt: null } })).toBe(2)

    sender.failWith = { ok: false, retryable: false, reason: 'Invalid address' }
    expect(await handleNotificationJob(job(variant.id), deps)).toBe(
      'sent back-in-stock to 0 (2 refused)',
    )
    expect(await db.stockAlert.count({ where: { notifiedAt: null } })).toBe(0)
  })

  it('an unknown size is hopeless (no retries)', async () => {
    await expect(
      handleNotificationJob(job('00000000-0000-4000-8000-000000000000'), deps),
    ).rejects.toBeInstanceOf(UnrecoverableError)
  })
})
