// HTTP tests for GET /content-blocks/:key and POST /subscribers (real nowoll_test DB).
import type { NestExpressApplication } from '@nestjs/platform-express'
import request from 'supertest'
import { createTestApp } from './utils/app.js'
import { resetDatabase, testPrisma } from './utils/test-db.js'

const db = testPrisma()
afterAll(() => db.$disconnect())

describe('content blocks API', () => {
  let app: NestExpressApplication
  const http = () => request(app.getHttpServer())
  const hero = { heading: 'always new', ctaLabel: 'Shop now', ctaHref: '/shop' }

  beforeAll(async () => {
    app = await createTestApp({ asAdmin: false }) // public route — no admin needed
  })
  afterAll(() => app.close())
  beforeEach(() => resetDatabase())

  it('serves an active block, with optional fields filled in', async () => {
    await db.contentBlock.create({ data: { key: 'homepage_hero', data: hero } })
    const res = await http().get('/api/v1/content-blocks/homepage_hero').expect(200)
    expect(res.body.data).toEqual({
      key: 'homepage_hero',
      data: { ...hero, subheading: null, imageUrl: null, imageAlt: null },
    })
  })

  it('hides inactive blocks', async () => {
    await db.contentBlock.create({
      data: { key: 'announcement_bar', data: { text: 'Hi' }, isActive: false },
    })
    await http().get('/api/v1/content-blocks/announcement_bar').expect(404)
  })

  it('hides blocks whose data is invalid (e.g. a javascript: link) instead of serving them', async () => {
    await db.contentBlock.create({
      data: { key: 'homepage_hero', data: { ...hero, ctaHref: 'javascript:alert(1)' } },
    })
    await http().get('/api/v1/content-blocks/homepage_hero').expect(404)
  })

  it('refuses keys that are not on the allow-list, even if the row exists', async () => {
    await db.contentBlock.create({ data: { key: 'internal_notes', data: { secret: 'x' } } })
    await http().get('/api/v1/content-blocks/internal_notes').expect(404)
  })
})

describe('subscribers API', () => {
  let app: NestExpressApplication
  const http = () => request(app.getHttpServer())
  const subscribe = (body: object) => http().post('/api/v1/subscribers').send(body)

  // A fresh app per test: the 5/minute limit must not leak between tests.
  beforeEach(async () => {
    await resetDatabase()
    app = await createTestApp({ asAdmin: false })
  })
  afterEach(() => app.close())

  it('stores a new email as PENDING with a confirmation token, normalized', async () => {
    const res = await subscribe({ email: '  Rafi@Nowoll.COM ', source: 'homepage' }).expect(201)
    expect(res.body.data).toEqual({ message: "Thanks — we'll confirm by email soon." })
    const row = await db.subscriber.findUniqueOrThrow({ where: { email: 'rafi@nowoll.com' } })
    expect(row).toMatchObject({ status: 'PENDING', source: 'homepage' })
    expect(row.confirmToken).toMatch(/^[0-9a-f]{64}$/)
  })

  it('answers identically for an existing subscriber (no email enumeration) and changes nothing', async () => {
    await db.subscriber.create({
      data: { email: 'known@x.com', status: 'SUBSCRIBED', confirmToken: null },
    })
    const res = await subscribe({ email: 'known@x.com' }).expect(201)
    expect(res.body.data).toEqual({ message: "Thanks — we'll confirm by email soon." })
    expect(
      await db.subscriber.findUniqueOrThrow({ where: { email: 'known@x.com' } }),
    ).toMatchObject({ status: 'SUBSCRIBED' })
  })

  it('puts someone who unsubscribed back to PENDING with a new token', async () => {
    await db.subscriber.create({
      data: { email: 'back@x.com', status: 'UNSUBSCRIBED', unsubscribedAt: new Date() },
    })
    await subscribe({ email: 'back@x.com' }).expect(201)
    const row = await db.subscriber.findUniqueOrThrow({ where: { email: 'back@x.com' } })
    expect(row).toMatchObject({ status: 'PENDING', unsubscribedAt: null })
    expect(row.confirmToken).toBeTruthy()
  })

  it.each([
    ['bad email', { email: 'not-an-email' }],
    ['unknown source', { email: 'a@b.com', source: 'popup' }],
    ['extra field', { email: 'a@b.com', status: 'SUBSCRIBED' }],
  ])('rejects %s', async (_label, body) => {
    await subscribe(body).expect(400)
    expect(await db.subscriber.count()).toBe(0)
  })

  it('allows 5 sign-ups per minute per visitor, then 429', async () => {
    for (let i = 0; i < 5; i++) await subscribe({ email: `u${i}@x.com` }).expect(201)
    await subscribe({ email: 'u6@x.com' }).expect(429)
    expect(await db.subscriber.count()).toBe(5)
  })
})
