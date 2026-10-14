// Step 43b — Admin → Content → Emails: the wording, ADMIN only, never public.
import type { NestExpressApplication } from '@nestjs/platform-express'
import request from 'supertest'
import { CUSTOMER_NOTIFIER } from '../src/notifications/customer-notifier.js'
import { signInAsStaff } from './utils/admin.js'
import { createTestApp } from './utils/app.js'
import type { RecordingCustomerNotifier } from './utils/services.js'
import { resetDatabase } from './utils/test-db.js'

const WORDING = {
  footer: 'Nowoll · Dhanmondi, Dhaka',
  showLogo: true,
  emails: { 'order-shipped': { subject: 'Order {order} is coming, {name}!' } },
}

describe('Email wording (step 43b)', () => {
  let app: NestExpressApplication
  const http = () => request(app.getHttpServer())

  beforeEach(async () => {
    await resetDatabase()
    app = await createTestApp({ asAdmin: true })
  })
  afterEach(() => app.close())

  it('save and read back (cleaned); clear goes back to the built-in wording', async () => {
    const saved = (
      await http()
        .put('/api/v1/admin/email-wording')
        .send({ data: WORDING, isActive: true })
        .expect(200)
    ).body.data
    expect(saved).toMatchObject({
      key: 'email_wording',
      isActive: true,
      data: {
        footer: 'Nowoll · Dhanmondi, Dhaka',
        showLogo: true,
        emails: {
          'order-shipped': { subject: 'Order {order} is coming, {name}!', heading: '', intro: '' },
        },
      },
    })
    expect(
      (await http().get('/api/v1/admin/email-wording').expect(200)).body.data.data.footer,
    ).toBe('Nowoll · Dhanmondi, Dhaka')
    const cleared = (await http().delete('/api/v1/admin/email-wording').expect(200)).body.data
    expect(cleared).toMatchObject({ data: null, isActive: false })
  })

  it('an unknown placeholder is refused with the right ones named', async () => {
    const r = await http()
      .put('/api/v1/admin/email-wording')
      .send({ data: { emails: { welcome: { subject: 'Hi {nmae}' } } }, isActive: true })
      .expect(400)
    expect(r.body.details.join(' ')).toMatch(/\{nmae\}.*\{name\}, \{store\}/)
  })

  it('never public, and not reachable through the general content routes', async () => {
    await http()
      .put('/api/v1/admin/email-wording')
      .send({ data: WORDING, isActive: true })
      .expect(200)
    expect(
      (await http().get('/api/v1/content-blocks/email_wording').expect(200)).body.data,
    ).toBeNull()
    await http().get('/api/v1/admin/content-blocks/email_wording').expect(404)
    await http()
      .put('/api/v1/admin/content-blocks/email_wording')
      .send({ data: {}, isActive: true })
      .expect(404)
    const list = (await http().get('/api/v1/admin/content-blocks').expect(200)).body.data
    expect(list.map((b: { key: string }) => b.key)).not.toContain('email_wording')
  })

  it('Admin only: Staff are refused (403), signed-out visitors too (401)', async () => {
    const staff = await createTestApp({ asAdmin: true, role: 'STAFF' })
    const outsider = await createTestApp({ asAdmin: false })
    try {
      await request(staff.getHttpServer()).get('/api/v1/admin/email-wording').expect(403)
      await request(staff.getHttpServer())
        .put('/api/v1/admin/email-wording')
        .send({ data: WORDING, isActive: true })
        .expect(403)
      await request(outsider.getHttpServer()).get('/api/v1/admin/email-wording').expect(401)
    } finally {
      await staff.close()
      await outsider.close()
    }
  })
})

describe('"Send me a test" (step 43b)', () => {
  let app: NestExpressApplication

  beforeEach(async () => {
    await resetDatabase()
    app = await createTestApp({ asAdmin: false }) // real sign-in: we need the admin's own email
  })
  afterEach(() => app.close())

  it('goes to the SIGNED-IN admin — an address in the request is ignored', async () => {
    const { cookie } = await signInAsStaff(app, 'rafi.admin@nowoll.test', 'ADMIN')
    const r = await request(app.getHttpServer())
      .post('/api/v1/admin/email-wording/test')
      .set('Cookie', cookie)
      .send({ kind: 'order-shipped', wording: WORDING, to: 'victim@example.com' })
    // "to" isn't part of the request at all — refused, so nothing is sent anywhere.
    expect(r.status).toBe(400)

    const ok = await request(app.getHttpServer())
      .post('/api/v1/admin/email-wording/test')
      .set('Cookie', cookie)
      .send({ kind: 'order-shipped', wording: WORDING })
      .expect(200)
    expect(ok.body.data).toEqual({ sentTo: 'rafi.admin@nowoll.test' })
    const tests = app.get<RecordingCustomerNotifier>(CUSTOMER_NOTIFIER).tests
    expect(tests).toEqual([
      {
        tag: 'order-shipped',
        to: 'rafi.admin@nowoll.test',
        wording: expect.objectContaining({ footer: WORDING.footer }),
      },
    ])
  })

  it('unsaved wording is checked like a save; unknown email kinds refused', async () => {
    const { cookie } = await signInAsStaff(app, 'rafi.admin@nowoll.test', 'ADMIN')
    const send = (body: object) =>
      request(app.getHttpServer())
        .post('/api/v1/admin/email-wording/test')
        .set('Cookie', cookie)
        .send(body)
    await send({
      kind: 'order-shipped',
      wording: { emails: { 'order-shipped': { subject: '{oops}' } } },
    }).expect(400)
    await send({ kind: 'low-stock', wording: {} }).expect(400)
    expect(app.get<RecordingCustomerNotifier>(CUSTOMER_NOTIFIER).tests).toEqual([])
  })
})
