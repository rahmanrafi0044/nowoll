// Step 39b — Meta Conversions API, API side: what is saved at checkout (only
// with Marketing consent) and Admin → Marketing (checklist, test event, log).
// Meta is ALWAYS the fake here (test/utils/fake-meta-sender.ts).
import { randomUUID } from 'node:crypto'
import type { NestExpressApplication } from '@nestjs/platform-express'
import { sha256 } from '@nowoll/analytics/server'
import request from 'supertest'
import { META_SENDER } from '../src/marketing/meta-sender.js'
import { createTestApp } from './utils/app.js'
import { makeCategory, makeProduct, seedShippingZones } from './utils/factories.js'
import type { FakeMetaSender } from './utils/fake-meta-sender.js'
import { resetDatabase, testPrisma } from './utils/test-db.js'

const db = testPrisma()
afterAll(() => db.$disconnect())

const FBP = 'fb.1.1760000000000.1234567890'
const FBC = 'fb.1.1760000000000.IwAR2xyz_ABC-def'
const UA = 'Mozilla/5.0 (Linux; Android 14) Test'

async function orderBody(overrides: object = {}) {
  const c = await makeCategory()
  const p = await makeProduct({
    categoryId: c.id,
    basePrice: '1490',
    variants: [{ size: 'M', color: 'Blue', stock: 20 }],
  })
  return {
    items: [{ variantId: p.variants[0]!.id, quantity: 1 }],
    contact: { fullName: 'Rafi Rahman', email: 'rafi@example.com', phone: '01712345678' },
    address: { division: 'Dhaka', district: 'Dhaka', area: 'Dhanmondi', addressLine1: 'House 12' },
    paymentMethod: 'COD',
    expectedTotal: '1550',
    ...overrides,
  }
}

describe('checkout: browser details saved ONLY with Marketing consent', () => {
  let app: NestExpressApplication
  const place = (b: object) =>
    request(app.getHttpServer())
      .post('/api/v1/orders')
      .set('Idempotency-Key', randomUUID())
      .set('User-Agent', UA)
      .set('X-Forwarded-For', '103.4.145.2') // Nginx in production ('trust proxy' 1)
      .send(b)

  beforeEach(async () => {
    await resetDatabase()
    await seedShippingZones()
    app = await createTestApp({ asAdmin: false })
  })
  afterEach(() => app.close())

  it('consent → cookies, real IP, browser name and the checkout address, in the same order', async () => {
    await place(await orderBody({ tracking: { marketing: true, fbp: FBP, fbc: FBC } })).expect(201)
    const order = await db.order.findFirstOrThrow({ include: { tracking: true } })
    expect(order.tracking).toMatchObject({
      fbp: FBP,
      fbc: FBC,
      clientIp: '103.4.145.2',
      userAgent: UA,
      sourceUrl: expect.stringMatching(/^https?:\/\/.+\/checkout$/),
    })
  })

  it('no tracking part, or marketing: false → nothing saved', async () => {
    await place(await orderBody()).expect(201)
    await place(await orderBody({ tracking: { marketing: false, fbp: FBP } })).expect(201)
    expect(await db.order.count()).toBe(2)
    expect(await db.orderTracking.count()).toBe(0)
  })

  it('consent without Meta cookies (Pixel blocked) → still saved, cookies empty', async () => {
    await place(await orderBody({ tracking: { marketing: true } })).expect(201)
    expect(await db.orderTracking.findFirstOrThrow()).toMatchObject({ fbp: null, fbc: null })
  })

  it('anything that is not a real Meta cookie is refused — the order is not placed', async () => {
    for (const tracking of [
      { marketing: true, fbc: 'fb.1.123.<script>' },
      { marketing: true, fbp: 'hello' },
      { marketing: 'yes' },
    ]) {
      const r = await place(await orderBody({ tracking })).expect(400)
      expect(JSON.stringify(r.body)).toMatch(/tracking/)
    }
    expect(await db.order.count()).toBe(0)
  })
})

describe('Admin → Marketing', () => {
  let app: NestExpressApplication
  let meta: FakeMetaSender
  const http = () => request(app.getHttpServer())
  const setPixel = () =>
    http()
      .patch('/api/v1/admin/settings')
      .send({ values: { meta_pixel_id: '123456789012345' } })
      .expect(200)

  beforeEach(async () => {
    await resetDatabase()
    app = await createTestApp({ asAdmin: true })
    meta = app.get(META_SENDER)
  })
  afterEach(() => app.close())

  it('checklist: what is set — never the token itself', async () => {
    let s = (await http().get('/api/v1/admin/marketing/status').expect(200)).body.data
    expect(s).toEqual({
      pixelIdSet: false,
      domainVerificationSet: false,
      tokenSet: true,
      serverEventsOn: false,
      lastSentAt: null,
      lastFailure: null,
    })
    await setPixel()
    await http()
      .patch('/api/v1/admin/settings')
      .send({ values: { meta_capi_enabled: true } })
      .expect(200)
    meta.tokenSet = false
    s = (await http().get('/api/v1/admin/marketing/status').expect(200)).body.data
    expect(s).toMatchObject({ pixelIdSet: true, serverEventsOn: true, tokenSet: false })
  })

  it('test event: sent at once with the test code, logged as a test, Meta’s answer shown', async () => {
    await setPixel()
    const r = await http()
      .post('/api/v1/admin/marketing/test-event')
      .set('User-Agent', UA)
      .send({ testEventCode: ' TEST12345 ' })
      .expect(200)
    expect(r.body.data).toEqual({ ok: true, eventsReceived: 1, messages: [] })

    expect(meta.sent).toHaveLength(1)
    const [sent] = meta.sent
    expect(sent).toMatchObject({ pixelId: '123456789012345', testEventCode: 'TEST12345' })
    expect(sent!.events[0]).toMatchObject({
      event_name: 'Purchase',
      event_id: expect.stringMatching(/^test-/),
      action_source: 'website',
      user_data: { client_user_agent: UA, country: [sha256('bd')] },
    })

    const log = (await http().get('/api/v1/admin/marketing/events').expect(200)).body.data
    expect(log).toEqual([
      expect.objectContaining({
        eventName: 'Purchase',
        status: 'SENT',
        test: true,
        eventsReceived: 1,
        fbtraceId: 'FAKE-TRACE',
        orderNumber: null,
      }),
    ])
  })

  it('test event refused by Meta → the reason is shown and logged as failed', async () => {
    await setPixel()
    meta.answer = {
      ok: false,
      retry: false,
      tokenProblem: true,
      message: 'Error validating access token (code 190)',
      fbtraceId: 'T1',
    }
    const r = await http()
      .post('/api/v1/admin/marketing/test-event')
      .send({ testEventCode: 'TEST1' })
      .expect(200)
    expect(r.body.data).toEqual({
      ok: false,
      message: 'Error validating access token (code 190)',
      tokenProblem: true,
    })
    const s = (await http().get('/api/v1/admin/marketing/status').expect(200)).body.data
    expect(s.lastFailure).toMatchObject({ message: 'Error validating access token (code 190)' })
  })

  it('test event needs the Pixel ID, the token and a real test code — nothing sent otherwise', async () => {
    const send = (code: string) =>
      http().post('/api/v1/admin/marketing/test-event').send({ testEventCode: code })
    expect((await send('TEST1').expect(400)).body.message).toMatch(/Pixel ID/)
    await setPixel()
    meta.tokenSet = false
    expect((await send('TEST1').expect(400)).body.message).toMatch(/access token/)
    meta.tokenSet = true
    await send('hello').expect(400)
    await send('TEST1; DROP').expect(400)
    expect(meta.sent).toEqual([])
  })

  it('Admin only: Staff and signed-out visitors are refused', async () => {
    const staff = await createTestApp({ asAdmin: true, role: 'STAFF' })
    const outsider = await createTestApp({ asAdmin: false })
    try {
      for (const a of [staff, outsider]) {
        const status = a === staff ? 403 : 401
        await request(a.getHttpServer()).get('/api/v1/admin/marketing/status').expect(status)
        await request(a.getHttpServer()).get('/api/v1/admin/marketing/events').expect(status)
        await request(a.getHttpServer())
          .post('/api/v1/admin/marketing/test-event')
          .send({ testEventCode: 'TEST1' })
          .expect(status)
      }
    } finally {
      await staff.close()
      await outsider.close()
    }
  })
})
