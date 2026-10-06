import { RecordingEmailSender } from '@nowoll/email'
import { UnrecoverableError } from 'bullmq'
import { db, order, resetDatabase, user } from '../test/db.js'
import { type Deps, handleNotificationJob } from './handle-job.js'

let sender: RecordingEmailSender
let deps: Deps
beforeEach(async () => {
  await resetDatabase()
  sender = new RecordingEmailSender()
  deps = { db, sender, siteUrl: 'https://nowoll.com' }
})
afterAll(() => db.$disconnect())

const only = () => {
  expect(sender.sent).toHaveLength(1)
  return sender.sent[0]!
}

describe('welcome', () => {
  it('to the account email, first name, a link to the shop; the job id is the Idempotency-Key', async () => {
    const u = await user()
    await handleNotificationJob(
      { id: `welcome_${u.id}`, name: 'welcome', data: { userId: u.id } },
      deps,
    )
    expect(only()).toMatchObject({
      to: 'rafi@example.com',
      subject: 'Welcome to Nowoll',
      idempotencyKey: `welcome_${u.id}`,
    })
    expect(only().text).toContain('Welcome, Rafi!')
    expect(only().html).toContain('href="https://nowoll.com/shop"')
  })

  it('a banned account gets nothing', async () => {
    const u = await user({ status: 'BANNED' })
    expect(await handleNotificationJob({ name: 'welcome', data: { userId: u.id } }, deps)).toBe(
      'skipped: account disabled',
    )
    expect(sender.sent).toEqual([])
  })
})

describe('newsletter confirmation', () => {
  it('links to the confirm and unsubscribe PAGES with the secret token — only while pending', async () => {
    const token = 'a'.repeat(64)
    const s = await db.subscriber.create({
      data: { email: 'fan@example.com', confirmToken: token },
    })
    await handleNotificationJob({ name: 'newsletter-confirm', data: { subscriberId: s.id } }, deps)
    expect(only().to).toBe('fan@example.com')
    expect(only().html).toContain(`href="https://nowoll.com/newsletter/confirm?token=${token}"`)
    expect(only().html).toContain(`href="https://nowoll.com/newsletter/unsubscribe?token=${token}"`)

    await db.subscriber.update({ where: { id: s.id }, data: { status: 'SUBSCRIBED' } })
    expect(
      await handleNotificationJob(
        { name: 'newsletter-confirm', data: { subscriberId: s.id } },
        deps,
      ),
    ).toBe('skipped: already subscribed')
  })
})

describe('returns', () => {
  async function aReturn(status: 'APPROVED' | 'REJECTED' | 'REQUESTED', signedIn = false) {
    const u = await user()
    const o = await order({ userId: signedIn ? u.id : null })
    return db.returnRequest.create({
      data: {
        orderId: o.id,
        userId: u.id,
        reason: 'WRONG_SIZE',
        status,
        adminNote: status === 'APPROVED' ? 'Our courier collects it tomorrow.' : null,
        rejectionReason: status === 'REJECTED' ? 'Worn — tags removed.' : null,
        items: { create: { orderItemId: o.items[0]!.id, quantity: 1 } },
      },
    })
  }

  it('approved → the items and your instructions', async () => {
    const r = await aReturn('APPROVED', true)
    await handleNotificationJob({ name: 'return-approved', data: { returnId: r.id } }, deps)
    expect(only().subject).toBe('Your return for order NW-10001 is approved')
    expect(only().text).toContain('Our courier collects it tomorrow.')
    expect(only().text).toContain('Oxford Shirt')
    expect(only().html).toContain('href="https://nowoll.com/account/orders/NW-10001"') // signed in
  })

  it('rejected → the reason; a guest order links to tracking', async () => {
    const r = await aReturn('REJECTED')
    await handleNotificationJob({ name: 'return-rejected', data: { returnId: r.id } }, deps)
    expect(only().text).toContain('Worn — tags removed.')
    expect(only().html).toContain('href="https://nowoll.com/orders/track"')
  })

  it('a job whose return has moved on sends nothing', async () => {
    const r = await aReturn('REQUESTED')
    expect(
      await handleNotificationJob({ name: 'return-approved', data: { returnId: r.id } }, deps),
    ).toBe('skipped: return is REQUESTED')
    expect(sender.sent).toEqual([])
  })
})

describe('refund processed', () => {
  it('online refund → "back to the card or wallet"; cash → "sent to you directly"; never while pending', async () => {
    const online = await order({ paymentMethod: 'SSLCOMMERZ' })
    const f = await db.refund.create({
      data: { paymentId: online.payments[0]!.id, amount: '1341', status: 'PROCESSED' },
    })
    await handleNotificationJob({ name: 'refund-processed', data: { refundId: f.id } }, deps)
    expect(only().subject).toBe('Refund of ৳1,341 — order NW-10001')
    expect(only().text).toMatch(/card or wallet you paid with/)

    const cash = await order()
    const g = await db.refund.create({
      data: { paymentId: cash.payments[0]!.id, amount: '500', status: 'PROCESSED' },
    })
    await handleNotificationJob({ name: 'refund-processed', data: { refundId: g.id } }, deps)
    expect(sender.sent[1]!.text).toMatch(/sent it to you directly/)

    const pending = await db.refund.create({
      data: { paymentId: cash.payments[0]!.id, amount: '10', status: 'PENDING' },
    })
    expect(
      await handleNotificationJob(
        { name: 'refund-processed', data: { refundId: pending.id } },
        deps,
      ),
    ).toBe('skipped: refund is PENDING')
  })
})

describe('shipped / delivered (triggered by the admin screen in Phase 5)', () => {
  it('shipped → courier and tracking number; only while the order IS shipped', async () => {
    const o = await order({ status: 'SHIPPED', courierName: 'Steadfast', trackingNumber: 'SF123' })
    await handleNotificationJob({ name: 'order-shipped', data: { orderId: o.id } }, deps)
    expect(only().text).toMatch(/Tracking number: SF123/)
    const delivered = await order({ status: 'DELIVERED' })
    expect(
      await handleNotificationJob({ name: 'order-shipped', data: { orderId: delivered.id } }, deps),
    ).toBe('skipped: order is DELIVERED')
  })

  it('delivered → mentions the return window from the settings', async () => {
    await db.setting.create({ data: { key: 'return_window_days', value: 14 } })
    const o = await order()
    await handleNotificationJob({ name: 'order-delivered', data: { orderId: o.id } }, deps)
    expect(only().text).toMatch(/within 14 days/)
  })
})

describe('retry rules', () => {
  it('temporary failure → Error (retry); hopeless email or missing data → UnrecoverableError', async () => {
    const u = await user()
    sender.failWith = { ok: false, reason: 'Resend 503', retryable: true }
    const temporary = await handleNotificationJob(
      { name: 'welcome', data: { userId: u.id } },
      deps,
    ).catch((e: unknown) => e)
    expect(temporary).toBeInstanceOf(Error)
    expect(temporary).not.toBeInstanceOf(UnrecoverableError)
    sender.failWith = { ok: false, reason: 'Resend 422', retryable: false }
    await expect(
      handleNotificationJob({ name: 'welcome', data: { userId: u.id } }, deps),
    ).rejects.toBeInstanceOf(UnrecoverableError)
    sender.failWith = null
    await expect(
      handleNotificationJob(
        { name: 'refund-processed', data: { refundId: '00000000-0000-4000-8000-000000000000' } },
        deps,
      ),
    ).rejects.toBeInstanceOf(UnrecoverableError)
  })
})
