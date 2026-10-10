// Step 38 (part 1): store settings — Admin → Settings edits them; the shop
// reads only the public ones. Every value is checked; a broken stored value
// falls back to its default instead of breaking a page.
import type { NestExpressApplication } from '@nestjs/platform-express'
import request from 'supertest'
import { createTestApp } from './utils/app.js'
import { resetDatabase, testPrisma } from './utils/test-db.js'

const db = testPrisma()
afterAll(() => db.$disconnect())

describe('settings (step 38)', () => {
  let app: NestExpressApplication
  const http = () => request(app.getHttpServer())
  const save = (values: object) => http().patch('/api/v1/admin/settings').send({ values })

  beforeAll(async () => {
    app = await createTestApp({ asAdmin: true })
  })
  afterAll(() => app.close())
  beforeEach(() => resetDatabase())

  it('nothing saved yet: today’s defaults', async () => {
    const all = (await http().get('/api/v1/admin/settings').expect(200)).body.data
    expect(all).toMatchObject({
      store_name: 'Nowoll',
      store_tagline: 'always new',
      vat_rate: 0,
      return_window_days: 7,
      shop_page_size: 24,
      shop_default_sort: 'newest',
    })
  })

  it('saves only what is sent, cleaned; the shop sees the public part only', async () => {
    const r = await save({
      store_name: '  Nowoll BD ',
      store_phone: '01712-345678',
      store_email: 'Hello@Nowoll.com',
      social_facebook: 'https://www.facebook.com/nowoll',
      vat_rate: 7.5,
      admin_notification_email: 'rafi@nowoll.com',
      thank_you_message: 'We’ll call you to confirm.',
    }).expect(200)
    expect(r.body.data).toMatchObject({
      store_name: 'Nowoll BD',
      store_phone: '+8801712345678',
      store_email: 'hello@nowoll.com',
      vat_rate: 7.5,
      store_tagline: 'always new', // untouched
    })
    const pub = (await http().get('/api/v1/settings/public').expect(200)).body.data
    expect(pub).toMatchObject({
      store_name: 'Nowoll BD',
      social_facebook: 'https://www.facebook.com/nowoll',
      thank_you_message: 'We’ll call you to confirm.',
    })
    expect(pub).not.toHaveProperty('admin_notification_email')
    expect(pub).not.toHaveProperty('vat_rate')

    // The rest of the shop follows: checkout's VAT, the invoice's store details.
    expect(await db.setting.findUnique({ where: { key: 'vat_rate' } })).toMatchObject({
      value: 7.5,
    })
  })

  it('refused with every problem listed — nothing saved', async () => {
    const r = await save({
      store_name: '',
      social_instagram: 'https://instagram.com.evil.example/x',
      vat_rate: 120,
      shop_page_size: 30,
      currency: 'USD',
    }).expect(400)
    expect(r.body.error).toBe('INVALID_SETTINGS')
    const all = r.body.details.join(' | ')
    for (const key of ['store_name', 'social_instagram', 'vat_rate', 'shop_page_size', 'currency'])
      expect(all).toContain(key)
    expect(await db.setting.count()).toBe(0)
    await http().patch('/api/v1/admin/settings').send({ store_name: 'x' }).expect(400) // must be { values }
  })

  it('a broken stored value (e.g. edited in the database) falls back to its default', async () => {
    await db.setting.create({ data: { key: 'shop_page_size', value: 'lots' } })
    await db.setting.create({ data: { key: 'store_name', value: 'Still Here' } })
    const pub = (await http().get('/api/v1/settings/public').expect(200)).body.data
    expect(pub).toMatchObject({ shop_page_size: 24, store_name: 'Still Here' })
  })

  it('the existing readers see saved values (checkout VAT, returns, invoices)', async () => {
    await save({ vat_rate: 5, return_window_days: 0, store_address: 'Dhanmondi, Dhaka' }).expect(
      200,
    )
    const { SettingsService } = await import('../src/settings/settings.service.js')
    const settings = app.get(SettingsService)
    expect(await settings.vatRate()).toBe(5)
    expect(await settings.returnWindowDays()).toBe(0)
    expect((await settings.storeInfo()).address).toBe('Dhanmondi, Dhaka')
  })

  it('admin-only (the public part stays open)', async () => {
    const outsider = await createTestApp({ asAdmin: false })
    try {
      const h = () => request(outsider.getHttpServer())
      await h().get('/api/v1/admin/settings').expect(401)
      await h()
        .patch('/api/v1/admin/settings')
        .send({ values: { store_name: 'x' } })
        .expect(401)
      await h().get('/api/v1/settings/public').expect(200)
    } finally {
      await outsider.close()
    }
  })
})
