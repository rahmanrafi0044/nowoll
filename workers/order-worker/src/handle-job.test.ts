import { RecordingEmailSender } from '@nowoll/email'
import { UnrecoverableError } from 'bullmq'
import { db, makeOrder, resetDatabase } from '../test/db.js'
import { type Deps, handleOrderJob } from './handle-job.js'

let sender: RecordingEmailSender
let deps: Deps

beforeEach(async () => {
  await resetDatabase()
  sender = new RecordingEmailSender()
  deps = {
    db,
    sender,
    siteUrl: 'https://nowoll.com',
    adminUrl: 'https://admin.nowoll.com',
    adminEmail: 'rafi@nowoll.com',
  }
})
afterAll(() => db.$disconnect())

describe('order-confirmation (cash on delivery)', () => {
  it('one email to the customer: receipt from the DATABASE, the job id as Idempotency-Key', async () => {
    const order = await makeOrder()
    const note = await handleOrderJob(
      {
        id: 'order-confirmation_NW-10001',
        name: 'order-confirmation',
        data: { orderId: order.id },
      },
      deps,
    )
    expect(note).toMatch(/^sent order-confirmation/)
    expect(sender.sent).toHaveLength(1)
    const email = sender.sent[0]!
    expect(email).toMatchObject({
      to: 'rafi@example.com',
      subject: 'Order NW-10001 — thank you!',
      tag: 'order-confirmation',
      idempotencyKey: 'order-confirmation_NW-10001',
    })
    expect(email.text).toMatch(/Please pay ৳2,742 in cash/)
    expect(email.text).toContain('Discount (TEN)')
    expect(email.text).toContain('House 12, Road 5, Dhanmondi, Dhaka')
  })

  it('guest → "Track your order"; signed in → their order page', async () => {
    const guest = await makeOrder()
    const member = await makeOrder({ signedIn: true })
    await handleOrderJob({ name: 'order-confirmation', data: { orderId: guest.id } }, deps)
    await handleOrderJob({ name: 'order-confirmation', data: { orderId: member.id } }, deps)
    expect(sender.sent[0]!.html).toContain('href="https://nowoll.com/orders/track"')
    expect(sender.sent[1]!.html).toContain('href="https://nowoll.com/account/orders/NW-10002"')
  })

  it('an online order gets no confirmation (it gets "payment received" instead)', async () => {
    const order = await makeOrder({ paymentMethod: 'SSLCOMMERZ' })
    expect(
      await handleOrderJob({ name: 'order-confirmation', data: { orderId: order.id } }, deps),
    ).toMatch(/^skipped/)
    expect(sender.sent).toEqual([])
  })

  it('replies go to the store email when one is set', async () => {
    await db.setting.create({ data: { key: 'store_email', value: 'help@nowoll.com' } })
    const order = await makeOrder()
    await handleOrderJob({ name: 'order-confirmation', data: { orderId: order.id } }, deps)
    expect(sender.sent[0]!.replyTo).toBe('help@nowoll.com')
  })
})

describe('payment-confirmed (online)', () => {
  it('only while the payment is PAID — then the receipt', async () => {
    const review = await makeOrder({ paymentMethod: 'SSLCOMMERZ', paymentStatus: 'UNDER_REVIEW' })
    expect(
      await handleOrderJob({ name: 'payment-confirmed', data: { orderId: review.id } }, deps),
    ).toBe('skipped: payment is UNDER_REVIEW')
    const paid = await makeOrder({ paymentMethod: 'SSLCOMMERZ', paymentStatus: 'PAID' })
    await handleOrderJob({ name: 'payment-confirmed', data: { orderId: paid.id } }, deps)
    expect(sender.sent.map((e) => e.subject)).toEqual(['Payment received — order NW-10002'])
    expect(sender.sent[0]!.text).toMatch(/we've received ৳2,742/)
  })
})

describe('low-stock-alert', () => {
  it('emails the admin with a link to the inventory page', async () => {
    const alert = {
      variantId: 'v1',
      sku: 'OXF-M',
      productName: 'Oxford Shirt',
      variantLabel: 'M / Blue',
      stock: 2,
      threshold: 5,
    }
    await handleOrderJob({ name: 'low-stock-alert', data: { alerts: [alert] } }, deps)
    expect(sender.sent[0]).toMatchObject({
      to: 'rafi@nowoll.com',
      subject: 'Low stock: Oxford Shirt (M / Blue) — 2 left',
    })
    expect(sender.sent[0]!.html).toContain('href="https://admin.nowoll.com/inventory"')
  })

  it('goes to the admin email set in Admin → Settings when there is one (step 38)', async () => {
    await db.setting.create({
      data: { key: 'admin_notification_email', value: 'stock@nowoll.com' },
    })
    const alert = {
      variantId: 'v1',
      sku: 'OXF-M',
      productName: 'Oxford Shirt',
      variantLabel: 'M / Blue',
      stock: 2,
      threshold: 5,
    }
    await handleOrderJob({ name: 'low-stock-alert', data: { alerts: [alert] } }, deps)
    expect(sender.sent[0]!.to).toBe('stock@nowoll.com')
  })
})

describe('the store’s name from Admin → Settings (step 38)', () => {
  it('emails carry the saved name and tagline', async () => {
    await db.setting.createMany({
      data: [
        { key: 'store_name', value: 'Nowoll BD' },
        { key: 'store_tagline', value: 'fresh every week' },
      ],
    })
    const order = await makeOrder()
    await handleOrderJob({ name: 'order-confirmation', data: { orderId: order.id } }, deps)
    expect(sender.sent[0]!.html).toContain('Nowoll BD')
    expect(sender.sent[0]!.html).toContain('fresh every week')
  })
})

describe('retry rules', () => {
  it('a temporary failure → Error (BullMQ tries again)', async () => {
    const order = await makeOrder()
    sender.failWith = { ok: false, reason: 'Resend 503', retryable: true }
    const error = await handleOrderJob(
      { name: 'order-confirmation', data: { orderId: order.id } },
      deps,
    ).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(Error)
    expect(error).not.toBeInstanceOf(UnrecoverableError)
  })

  it('a hopeless email, or a missing order → UnrecoverableError (no more tries)', async () => {
    const order = await makeOrder()
    sender.failWith = { ok: false, reason: 'Resend 422: invalid `to`', retryable: false }
    await expect(
      handleOrderJob({ name: 'order-confirmation', data: { orderId: order.id } }, deps),
    ).rejects.toBeInstanceOf(UnrecoverableError)
    sender.failWith = null
    await expect(
      handleOrderJob(
        { name: 'payment-confirmed', data: { orderId: '00000000-0000-4000-8000-000000000000' } },
        deps,
      ),
    ).rejects.toBeInstanceOf(UnrecoverableError)
  })
})
