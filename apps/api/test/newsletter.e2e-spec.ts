// Step 42 — Admin → Newsletter and the Resend webhook (docs/integrations/resend.md).
import { createHmac, randomUUID } from 'node:crypto'
import type { NestExpressApplication } from '@nestjs/platform-express'
import { parse } from 'csv-parse/sync'
import request from 'supertest'
import { CUSTOMER_NOTIFIER } from '../src/notifications/customer-notifier.js'
import { createTestApp } from './utils/app.js'
import { makeCategory, makeProduct, seedShippingZones } from './utils/factories.js'
import type { RecordingCustomerNotifier } from './utils/services.js'
import { resetDatabase, testPrisma } from './utils/test-db.js'

const db = testPrisma()
afterAll(() => db.$disconnect())

const SECRET = `whsec_${Buffer.from('a-test-signing-key-32-bytes-long').toString('base64')}`

const subscriber = (email: string, fields: Record<string, unknown> = {}) =>
  db.subscriber.create({
    data: { email, status: 'SUBSCRIBED', confirmedAt: new Date('2026-10-01T00:00:00Z'), ...fields },
  })

describe('Admin → Newsletter (step 42)', () => {
  let app: NestExpressApplication
  let events: RecordingCustomerNotifier['events']
  const http = () => request(app.getHttpServer())

  beforeEach(async () => {
    await resetDatabase()
    app = await createTestApp({ asAdmin: true })
    events = app.get<RecordingCustomerNotifier>(CUSTOMER_NOTIFIER).events
  })
  afterEach(() => app.close())

  it('the list: counts, status filter, search; newest first; sync state shown', async () => {
    await subscriber('rafi@example.com', { source: 'footer', createdAt: new Date('2026-10-01') })
    await subscriber('mita@example.com', {
      resendError: 'Resend 422: odd',
      createdAt: new Date('2026-10-02'),
    })
    await subscriber('wait@example.com', {
      status: 'PENDING',
      confirmedAt: null,
      createdAt: new Date('2026-10-03'),
    })
    await subscriber('gone@example.com', {
      status: 'UNSUBSCRIBED',
      createdAt: new Date('2026-10-04'),
    })

    const all = (await http().get('/api/v1/admin/subscribers').expect(200)).body.data
    expect(all.counts).toEqual({
      subscribed: 2,
      pending: 1,
      unsubscribed: 1,
      newLast30Days: expect.any(Number),
    })
    expect(all.items.map((i: { email: string }) => i.email)).toEqual([
      'gone@example.com',
      'wait@example.com',
      'mita@example.com',
      'rafi@example.com',
    ])
    expect(all.items[2]).toMatchObject({ resendError: 'Resend 422: odd', resendSyncedAt: null })

    const confirmed = (await http().get('/api/v1/admin/subscribers?status=SUBSCRIBED').expect(200))
      .body.data
    expect(confirmed.total).toBe(2)
    const found = (await http().get('/api/v1/admin/subscribers?q=RAFI').expect(200)).body.data
    expect(found.items).toEqual([
      expect.objectContaining({ email: 'rafi@example.com', source: 'footer' }),
    ])
    await http().get('/api/v1/admin/subscribers?status=MAYBE').expect(400)
  })

  it('CSV: confirmed people only; a formula-looking email can’t run in a spreadsheet', async () => {
    await subscriber('rafi@example.com', { source: 'homepage' })
    await subscriber('=cmd@example.com')
    await subscriber('wait@example.com', { status: 'PENDING', confirmedAt: null })
    const res = await http().get('/api/v1/admin/subscribers/export.csv').expect(200)
    expect(res.headers['content-type']).toBe('text/csv; charset=utf-8')
    expect(res.headers['content-disposition']).toMatch(/attachment/)
    const rows = parse(res.text, { columns: true, bom: true }) as Record<string, string>[]
    expect(rows.map((r) => r.email).sort()).toEqual(["'=cmd@example.com", 'rafi@example.com'])
    expect(rows.find((r) => r.email === 'rafi@example.com')).toEqual({
      email: 'rafi@example.com',
      confirmed_on: '2026-10-01',
      source: 'homepage',
    })
  })

  it('unsubscribe someone → marked, and Resend is told; again is fine', async () => {
    const s = await subscriber('rafi@example.com')
    await http().patch(`/api/v1/admin/subscribers/${s.id}/unsubscribe`).expect(200)
    await http().patch(`/api/v1/admin/subscribers/${s.id}/unsubscribe`).expect(200)
    expect(await db.subscriber.findUniqueOrThrow({ where: { id: s.id } })).toMatchObject({
      status: 'UNSUBSCRIBED',
      unsubscribedAt: expect.any(Date),
    })
    expect(events.filter((e) => e.type === 'newsletter-sync')).toEqual([
      { type: 'newsletter-sync', id: s.id },
    ])
  })

  it('erase someone (PDPO request) → the row is GONE, Resend’s copy is erased too', async () => {
    const s = await subscriber('rafi@example.com')
    await http().delete(`/api/v1/admin/subscribers/${s.id}`).expect(200)
    expect(await db.subscriber.findUnique({ where: { id: s.id } })).toBeNull()
    expect(events).toContainEqual({ type: 'newsletter-erase', id: 'rafi@example.com' })
    await http().delete(`/api/v1/admin/subscribers/${s.id}`).expect(404)
  })

  it('Resend status: on/off, segment, webhook, synced / waiting / failed — never the key', async () => {
    await subscriber('a@example.com', { resendSyncedAt: new Date() })
    await subscriber('b@example.com')
    await subscriber('c@example.com', { resendError: 'Resend refused the API key' })
    const st = (await http().get('/api/v1/admin/subscribers/resend').expect(200)).body.data
    expect(st).toEqual({
      enabled: false,
      segmentSet: false,
      webhookSet: false, // the test environment has no RESEND_WEBHOOK_SECRET
      synced: 1,
      waiting: 2,
      failed: 1,
      lastError: 'Resend refused the API key',
    })
    await http().post('/api/v1/admin/subscribers/resend/sync-all').expect(200)
    expect(events).toContainEqual({ type: 'newsletter-sync-all', id: 'all' })
  })

  it('Admin only: Staff and signed-out visitors are refused', async () => {
    const staff = await createTestApp({ asAdmin: true, role: 'STAFF' })
    const outsider = await createTestApp({ asAdmin: false })
    try {
      for (const [a, code] of [
        [staff, 403],
        [outsider, 401],
      ] as const) {
        await request(a.getHttpServer()).get('/api/v1/admin/subscribers').expect(code)
        await request(a.getHttpServer()).get('/api/v1/admin/subscribers/export.csv').expect(code)
      }
    } finally {
      await staff.close()
      await outsider.close()
    }
  })
})

describe('Resend webhook (step 42)', () => {
  let app: NestExpressApplication
  const http = () => request(app.getHttpServer())
  const post = (body: object, sign = true, at = new Date()) => {
    const raw = JSON.stringify(body)
    const ts = String(Math.floor(at.getTime() / 1000))
    const sig = createHmac('sha256', Buffer.from(SECRET.slice(6), 'base64'))
      .update(`msg_1.${ts}.${raw}`)
      .digest('base64')
    return http()
      .post('/api/v1/webhooks/resend')
      .set('Content-Type', 'application/json')
      .set('svix-id', 'msg_1')
      .set('svix-timestamp', ts)
      .set('svix-signature', sign ? `v1,${sig}` : 'v1,AAAA')
      .send(raw)
  }
  const unsubscribed = (email: string, updatedAt = new Date().toISOString()) => ({
    type: 'contact.updated',
    created_at: updatedAt,
    data: { id: 'c1', email, unsubscribed: true, updated_at: updatedAt },
  })

  beforeAll(() => {
    process.env.RESEND_WEBHOOK_SECRET = SECRET
  })
  afterAll(() => {
    delete process.env.RESEND_WEBHOOK_SECRET
  })
  beforeEach(async () => {
    await resetDatabase()
    app = await createTestApp({ asAdmin: false })
  })
  afterEach(() => app.close())

  it('signed "unsubscribed" → unsubscribed here too (and counted as synced)', async () => {
    await subscriber('rafi@example.com')
    const res = await post(unsubscribed('Rafi@Example.com')).expect(200)
    expect(res.body.data).toEqual({ received: true, action: 'unsubscribed' })
    expect(
      await db.subscriber.findUniqueOrThrow({ where: { email: 'rafi@example.com' } }),
    ).toMatchObject({
      status: 'UNSUBSCRIBED',
      resendSyncedAt: expect.any(Date),
      resendError: null,
    })
  })

  it('a bad or missing signature → 401, nothing changes', async () => {
    await subscriber('rafi@example.com')
    await post(unsubscribed('rafi@example.com'), false).expect(401)
    await http().post('/api/v1/webhooks/resend').send(unsubscribed('rafi@example.com')).expect(401)
    expect(
      (await db.subscriber.findUniqueOrThrow({ where: { email: 'rafi@example.com' } })).status,
    ).toBe('SUBSCRIBED')
  })

  it('a replayed old request (over 5 minutes) → 401', async () => {
    await subscriber('rafi@example.com')
    await post(unsubscribed('rafi@example.com'), true, new Date(Date.now() - 10 * 60_000)).expect(
      401,
    )
  })

  it('never SUBSCRIBES anyone; other events and unknown people are ignored', async () => {
    await subscriber('gone@example.com', { status: 'UNSUBSCRIBED' })
    const resub = {
      type: 'contact.updated',
      data: { email: 'gone@example.com', unsubscribed: false },
    }
    expect((await post(resub).expect(200)).body.data.action).toBe('none')
    expect(
      (await db.subscriber.findUniqueOrThrow({ where: { email: 'gone@example.com' } })).status,
    ).toBe('UNSUBSCRIBED')
    expect((await post({ type: 'email.sent', data: {} }).expect(200)).body.data.action).toBe('none')
    expect((await post(unsubscribed('stranger@example.com')).expect(200)).body.data.action).toBe(
      'ignored',
    )
  })

  it('a late "unsubscribed" from BEFORE they confirmed again is ignored', async () => {
    await subscriber('rafi@example.com', { confirmedAt: new Date() })
    const old = new Date(Date.now() - 60_000).toISOString()
    expect((await post(unsubscribed('rafi@example.com', old)).expect(200)).body.data.action).toBe(
      'ignored',
    )
  })

  it('not set up (no secret) → 404', async () => {
    delete process.env.RESEND_WEBHOOK_SECRET
    const plain = await createTestApp({ asAdmin: false })
    try {
      await request(plain.getHttpServer()).post('/api/v1/webhooks/resend').send({}).expect(404)
    } finally {
      await plain.close()
      process.env.RESEND_WEBHOOK_SECRET = SECRET
    }
  })
})

describe('checkout "email me" box (step 42)', () => {
  let app: NestExpressApplication
  let events: RecordingCustomerNotifier['events']

  beforeEach(async () => {
    await resetDatabase()
    await seedShippingZones()
    app = await createTestApp({ asAdmin: false })
    events = app.get<RecordingCustomerNotifier>(CUSTOMER_NOTIFIER).events
  })
  afterEach(() => app.close())

  async function placeOrder(extra: object) {
    const c = await makeCategory()
    const p = await makeProduct({
      categoryId: c.id,
      basePrice: '1490',
      variants: [{ size: 'M', color: 'Blue', stock: 5 }],
    })
    const res = await request(app.getHttpServer())
      .post('/api/v1/orders')
      .set('Idempotency-Key', randomUUID())
      .send({
        items: [{ variantId: p.variants[0]!.id, quantity: 1 }],
        contact: { fullName: 'Rafi Rahman', email: 'Rafi@Example.com', phone: '01712345678' },
        address: { division: 'Dhaka', district: 'Dhaka', addressLine1: 'House 12' },
        paymentMethod: 'COD',
        expectedTotal: '1550',
        ...extra,
      })
    expect(res.status).toBe(201)
    return res
  }

  it('ticked → waiting for confirmation (source "checkout") and a confirmation email', async () => {
    await placeOrder({ newsletter: true })
    expect(
      await db.subscriber.findUniqueOrThrow({ where: { email: 'rafi@example.com' } }),
    ).toMatchObject({
      status: 'PENDING',
      source: 'checkout',
    })
    expect(events.filter((e) => e.type === 'newsletter-confirm')).toHaveLength(1)
  })

  it('not ticked → not added', async () => {
    await placeOrder({})
    await placeOrder({ newsletter: false })
    expect(await db.subscriber.count()).toBe(0)
  })
})
