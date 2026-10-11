// Step 39b — the worker side of Meta's Conversions API, against a fake Meta.
import type { MetaAnswer, MetaServerEvent } from '@nowoll/analytics/server'
import { sha256 } from '@nowoll/analytics/server'
import { UnrecoverableError } from 'bullmq'
import { db, order, resetDatabase } from '../test/db.js'
import {
  handleMarketingJob,
  type MarketingDeps,
  type MarketingJob,
  type MetaSenderLike,
} from './marketing-job.js'

const NOW = new Date('2026-10-12T12:00:00Z')

class FakeMeta implements MetaSenderLike {
  tokenSet = true
  sent: { pixelId: string; events: MetaServerEvent[] }[] = []
  answers: MetaAnswer[] = []
  async send(pixelId: string, events: MetaServerEvent[]) {
    this.sent.push({ pixelId, events })
    return this.answers.shift() ?? { ok: true, eventsReceived: 1, messages: [], fbtraceId: 'TR' }
  }
}

let meta: FakeMeta
let deps: MarketingDeps
beforeEach(async () => {
  await resetDatabase()
  meta = new FakeMeta()
  deps = { db, meta, now: () => NOW }
  await setSettings({ meta_capi_enabled: true, meta_pixel_id: '123456789012345' })
})
afterAll(() => db.$disconnect())

async function setSettings(values: Record<string, unknown>) {
  for (const [key, value] of Object.entries(values))
    await db.setting.upsert({
      where: { key },
      create: { key, value: value as never },
      update: { value: value as never },
    })
}

/** An order whose customer allowed Marketing (it has browser details). */
const consentedOrder = (fields: Parameters<typeof order>[0] = {}) =>
  order({
    shippingPostalCode: '1207',
    ...fields,
    tracking: {
      create: {
        fbp: 'fb.1.1760000000000.1234567890',
        fbc: null,
        clientIp: '103.4.145.2',
        userAgent: 'Mozilla/5.0 Test',
        sourceUrl: 'https://nowoll.com/checkout',
      },
    },
  })

const job = (
  kind: 'purchase' | 'delivered',
  orderId: string,
  over: Partial<MarketingJob> = {},
): MarketingJob => ({
  name: 'meta-event',
  data: { kind, orderId },
  timestamp: NOW.getTime() - 60_000,
  attemptsMade: 0,
  opts: { attempts: 5 },
  ...over,
})

const logLines = () => db.metaEvent.findMany({ orderBy: { createdAt: 'asc' } })

describe('sending an order event', () => {
  it('Purchase: hashed customer details, browser details as-is, logged as SENT', async () => {
    const o = await consentedOrder({ status: 'CONFIRMED' })
    expect(await handleMarketingJob(job('purchase', o.id), deps)).toMatch(/^sent Purchase NW-/)

    expect(meta.sent).toHaveLength(1)
    const [e] = meta.sent[0]!.events
    expect(meta.sent[0]!.pixelId).toBe('123456789012345')
    expect(e).toMatchObject({
      event_name: 'Purchase',
      event_id: `purchase-NW-${o.orderNumber}`, // = the browser Pixel's → Meta keeps one
      event_time: Math.floor((NOW.getTime() - 60_000) / 1000), // when it happened
      event_source_url: 'https://nowoll.com/checkout',
      user_data: {
        em: [sha256('rafi@example.com')],
        ph: [sha256('8801712345678')],
        fn: [sha256('rafi')],
        ln: [sha256('rahman')],
        ct: [sha256('dhaka')],
        zp: [sha256('1207')],
        client_ip_address: '103.4.145.2',
        client_user_agent: 'Mozilla/5.0 Test',
        fbp: 'fb.1.1760000000000.1234567890',
      },
      custom_data: {
        value: 1550,
        currency: 'BDT',
        content_ids: ['OXF-M'],
        order_id: `NW-${o.orderNumber}`,
      },
    })
    expect(JSON.stringify(e)).not.toContain('rafi@example.com')

    expect(await logLines()).toEqual([
      expect.objectContaining({
        orderNumber: o.orderNumber,
        eventName: 'Purchase',
        status: 'SENT',
        eventsReceived: 1,
        fbtraceId: 'TR',
        test: false,
      }),
    ])
  })

  it('OrderDelivered for a delivered order, with its own event id', async () => {
    const o = await consentedOrder({ status: 'DELIVERED' })
    await handleMarketingJob(job('delivered', o.id), deps)
    expect(meta.sent[0]!.events[0]).toMatchObject({
      event_name: 'OrderDelivered',
      event_id: `delivered-NW-${o.orderNumber}`,
    })
  })
})

describe('skipped — logged with the reason, nothing sent to Meta', () => {
  const skipped = async (orderId: string, kind: 'purchase' | 'delivered' = 'purchase') => {
    expect(await handleMarketingJob(job(kind, orderId), deps)).toMatch(/^skipped/)
    expect(meta.sent).toEqual([])
    const [line] = await logLines()
    expect(line).toMatchObject({ status: 'SKIPPED' })
    return line!.message
  }

  it('switched off in Settings', async () => {
    await setSettings({ meta_capi_enabled: false })
    expect(await skipped((await consentedOrder()).id)).toMatch(/switched off/)
  })

  it('no Pixel ID', async () => {
    await setSettings({ meta_pixel_id: '' })
    expect(await skipped((await consentedOrder()).id)).toMatch(/Pixel ID/)
  })

  it('no token on the server', async () => {
    meta.tokenSet = false
    expect(await skipped((await consentedOrder()).id)).toMatch(/access token/)
  })

  it('no consent details (never given, or already deleted after 60 days)', async () => {
    expect(await skipped((await order()).id)).toMatch(/consent/)
  })

  it('cancelled before the job ran; online payment not confirmed; not delivered any more', async () => {
    expect(await skipped((await consentedOrder({ status: 'CANCELLED' })).id)).toMatch(/cancelled/)
    await db.metaEvent.deleteMany()
    const unpaid = await consentedOrder({ paymentMethod: 'SSLCOMMERZ', paymentStatus: 'PENDING' })
    expect(await skipped(unpaid.id)).toMatch(/payment/)
    await db.metaEvent.deleteMany()
    expect(await skipped((await consentedOrder({ status: 'SHIPPED' })).id, 'delivered')).toMatch(
      /delivered/,
    )
  })

  it('older than 7 days (Meta would refuse the whole request)', async () => {
    const o = await consentedOrder()
    const old = job('purchase', o.id, { timestamp: NOW.getTime() - 7 * 24 * 3600_000 })
    expect(await handleMarketingJob(old, deps)).toMatch(/Too old/)
    expect(meta.sent).toEqual([])
  })
})

describe('Meta trouble', () => {
  const busy: MetaAnswer = {
    ok: false,
    retry: true,
    tokenProblem: false,
    message: 'Service temporarily unavailable (code 2)',
    fbtraceId: null,
  }

  it('temporary → try again later (no log line yet); still failing at the last try → FAILED', async () => {
    const o = await consentedOrder()
    meta.answers = [busy, busy]
    await expect(handleMarketingJob(job('purchase', o.id), deps)).rejects.not.toBeInstanceOf(
      UnrecoverableError,
    )
    expect(await logLines()).toEqual([])
    await expect(
      handleMarketingJob(job('purchase', o.id, { attemptsMade: 4 }), deps),
    ).rejects.toBeInstanceOf(UnrecoverableError)
    expect(await logLines()).toEqual([
      expect.objectContaining({ status: 'FAILED', message: busy.message }),
    ])
  })

  it('a wrong event or an expired token → FAILED at once, not retried', async () => {
    const o = await consentedOrder()
    meta.answers = [
      {
        ok: false,
        retry: false,
        tokenProblem: true,
        message: 'Error validating access token (code 190)',
        fbtraceId: 'X',
      },
    ]
    await expect(handleMarketingJob(job('purchase', o.id), deps)).rejects.toBeInstanceOf(
      UnrecoverableError,
    )
    expect(await logLines()).toEqual([
      expect.objectContaining({
        status: 'FAILED',
        fbtraceId: 'X',
        message: expect.stringMatching(/190/),
      }),
    ])
  })
})

describe('daily clean-up', () => {
  it('deletes browser details older than 60 days (the order stays), and year-old log lines', async () => {
    const old = await consentedOrder()
    const recent = await consentedOrder()
    await db.orderTracking.update({
      where: { orderId: old.id },
      data: { createdAt: new Date(NOW.getTime() - 61 * 24 * 3600_000) },
    })
    await db.metaEvent.create({
      data: {
        eventName: 'Purchase',
        eventId: 'purchase-NW-1',
        status: 'SENT',
        createdAt: new Date(NOW.getTime() - 366 * 24 * 3600_000),
      },
    })
    const note = await handleMarketingJob(
      { name: 'tracking-cleanup', data: {}, timestamp: NOW.getTime(), attemptsMade: 0, opts: {} },
      deps,
    )
    expect(note).toBe('deleted 1 old browser details, 1 old log lines')
    expect((await db.orderTracking.findMany()).map((t) => t.orderId)).toEqual([recent.id])
    expect(await db.order.count()).toBe(2)
  })
})
