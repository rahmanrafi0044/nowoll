// Step 38 (part 1): store settings — Admin → Settings edits them; the shop
// reads only the public ones. Every value is checked; a broken stored value
// falls back to its default instead of breaking a page.
import type { NestExpressApplication } from '@nestjs/platform-express'
import request from 'supertest'
import sharp from 'sharp'
import { IMAGE_STORAGE } from '../src/storage/image-storage.js'
import { createTestApp } from './utils/app.js'
import { jpegWithGps, png } from './utils/images.js'
import type { MemoryImageStorage } from './utils/memory-image-storage.js'
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

  describe('the look (step 38, part 2)', () => {
    const upload = (kind: string, file: Buffer, name = 'pic.png') =>
      http().post(`/api/v1/admin/settings/images?kind=${kind}`).attach('file', file, name)
    const stored = async (url: string) => {
      const storage = app.get<MemoryImageStorage>(IMAGE_STORAGE)
      const path = url.split('/product-images/')[1]!
      return sharp(storage.files.get(path)!.data).metadata()
    }

    it('favicon: cropped to a 512×512 PNG; share image: 1200×630; logo keeps its shape', async () => {
      const fav = (await upload('favicon', await png(800, 600)).expect(201)).body.data.url
      expect(fav).toMatch(/\/branding\/favicon-[0-9a-f-]{36}\.png$/)
      expect(await stored(fav)).toMatchObject({ width: 512, height: 512, format: 'png' })

      const share = (await upload('share', await jpegWithGps(2400, 1600), 'a.jpg').expect(201)).body
        .data.url
      const meta = await stored(share)
      expect(meta).toMatchObject({ width: 1200, height: 630, format: 'jpeg' })
      expect(meta.exif).toBeUndefined() // hidden data (GPS) gone

      const logo = (await upload('logo', await png(1200, 300)).expect(201)).body.data.url
      expect(await stored(logo)).toMatchObject({ width: 600, height: 150, hasAlpha: true })
    })

    it('refused: too small, not an image (an SVG), no file, unknown kind', async () => {
      const small = await upload('favicon', await png(32, 32)).expect(400)
      expect(small.body.message).toMatch(/at least 64×64 pixels — this one is 32×32/)
      await upload('share', await png(500, 300)).expect(400)
      await upload(
        'logo',
        Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
        'logo.svg',
      ).expect(415)
      await http().post('/api/v1/admin/settings/images?kind=logo').expect(400)
      await upload('banner', await png(800, 600)).expect(400)
    })

    it('pictures can only be our own uploads; colours must be readable; fonts from the list', async () => {
      const own = (await upload('logo', await png(400, 100)).expect(201)).body.data.url
      await save({ logo_url: own, brand_color: '#1E3A8A', font: 'poppins' }).expect(200)
      expect((await http().get('/api/v1/settings/public')).body.data).toMatchObject({
        logo_url: own,
        brand_color: '#1e3a8a',
        font: 'poppins',
      })
      const r = await save({ favicon_url: 'https://evil.example/favicon.png' }).expect(400)
      expect(r.body.details.join(' ')).toMatch(/favicon_url: Upload the picture here/)
      // A real upload address, but a product photo — not a brand picture.
      await save({ share_image_url: own.replace('/branding/', '/products/') }).expect(400)
      await save({ brand_color: '#ffff00' }).expect(400) // too light for white text
      await save({ font: 'comic-sans' }).expect(400)
      await save({ logo_url: '' }).expect(200) // removing is always fine
    })

    it('admin-only', async () => {
      const outsider = await createTestApp({ asAdmin: false })
      try {
        await request(outsider.getHttpServer())
          .post('/api/v1/admin/settings/images?kind=logo')
          .attach('file', await png(400, 100), 'a.png')
          .expect(401)
      } finally {
        await outsider.close()
      }
    })
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
