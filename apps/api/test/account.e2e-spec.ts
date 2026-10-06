// HTTP tests for the customer account routes (step 23): my orders, saved
// addresses, wishlist, profile, change password. Real nowoll_test DB, fake
// Supabase Auth. The rule checked everywhere: a customer only ever sees and
// changes THEIR OWN things — and someone else's thing looks like a missing one.
import { randomUUID } from 'node:crypto'
import type { NestExpressApplication } from '@nestjs/platform-express'
import request from 'supertest'
import { signUp } from './utils/auth.js'
import { createTestApp } from './utils/app.js'
import { makeCategory, makeProduct, seedShippingZones } from './utils/factories.js'
import { resetDatabase, testPrisma } from './utils/test-db.js'

const db = testPrisma()
afterAll(() => db.$disconnect())

describe('account', () => {
  let app: NestExpressApplication
  let rafi: { cookie: string; userId: string }
  let other: { cookie: string; userId: string }
  const http = () => request(app.getHttpServer())
  const as = (who: { cookie: string }) => ({
    get: (url: string) => http().get(`/api/v1${url}`).set('Cookie', who.cookie),
    post: (url: string, body: object = {}) =>
      http().post(`/api/v1${url}`).set('Cookie', who.cookie).send(body),
    patch: (url: string, body: object) =>
      http().patch(`/api/v1${url}`).set('Cookie', who.cookie).send(body),
    delete: (url: string) => http().delete(`/api/v1${url}`).set('Cookie', who.cookie),
  })

  beforeEach(async () => {
    await resetDatabase()
    await seedShippingZones()
    app = await createTestApp({ asAdmin: false })
    rafi = await signUp(app, 'rafi@example.com', { fullName: 'Rafi Rahman', phone: '01712345678' })
    other = await signUp(app, 'other@example.com')
  })
  afterEach(() => app.close())

  it('every account route needs a sign-in', async () => {
    for (const url of ['/orders/my', '/orders/my/NW-10001', '/addresses', '/wishlist'])
      await http().get(`/api/v1${url}`).expect(401)
    await http().patch('/api/v1/auth/me').send({ fullName: 'X' }).expect(401)
  })

  describe('my orders', () => {
    async function placeOrder(cookie?: string) {
      const c = await makeCategory()
      const p = await makeProduct({
        categoryId: c.id,
        basePrice: '1490',
        variants: [{ size: 'M', color: 'Blue', stock: 10 }],
      })
      const req = http().post('/api/v1/orders').set('Idempotency-Key', randomUUID())
      const res = await (cookie ? req.set('Cookie', cookie) : req)
        .send({
          items: [{ variantId: p.variants[0]!.id, quantity: 2 }],
          contact: { fullName: 'Rafi Rahman', email: 'rafi@example.com', phone: '01712345678' },
          address: { division: 'Dhaka', district: 'Dhaka', addressLine1: 'House 12, Road 5' },
          paymentMethod: 'COD',
          expectedTotal: '3040',
        })
        .expect(201)
      return res.body.data.displayNumber as string
    }

    it('lists only orders placed while signed in — never guest orders with the same email', async () => {
      const first = await placeOrder(rafi.cookie)
      await placeOrder() // guest, SAME email
      const second = await placeOrder(rafi.cookie)
      await placeOrder(other.cookie)

      const res = await as(rafi).get('/orders/my').expect(200)
      expect(res.headers['cache-control']).toBe('no-store')
      expect(res.body.data).toMatchObject({ total: 2, page: 1, pageSize: 10, totalPages: 1 })
      expect(res.body.data.items.map((o: { displayNumber: string }) => o.displayNumber)).toEqual([
        second, // newest first
        first,
      ])
      expect(res.body.data.items[0]).toMatchObject({
        status: 'PENDING',
        paymentMethod: 'COD',
        total: '3040',
        itemCount: 2,
        imageUrls: [expect.stringContaining('supabase.co')], // the item photo, copied onto the order
      })
    })

    it('pages through long histories', async () => {
      for (let i = 0; i < 3; i++) await placeOrder(rafi.cookie)
      const res = await as(rafi).get('/orders/my?page=2&pageSize=2').expect(200)
      expect(res.body.data).toMatchObject({ total: 3, page: 2, totalPages: 2 })
      expect(res.body.data.items).toHaveLength(1)
      await as(rafi).get('/orders/my?pageSize=500').expect(400)
    })

    it("one order by its number: receipt + progress; someone else's is a 404 like a missing one", async () => {
      const mine = await placeOrder(rafi.cookie)
      const theirs = await placeOrder(other.cookie)

      const res = await as(rafi).get(`/orders/my/${mine.toLowerCase()}`).expect(200) // "nw-10001" works too
      expect(res.body.data).toMatchObject({
        displayNumber: mine,
        deliveryAddress: { addressLine1: 'House 12, Road 5' },
        totals: { total: '3040' },
        timeline: [{ status: 'PENDING' }],
        courierName: null,
      })
      const someoneElses = await as(rafi).get(`/orders/my/${theirs}`).expect(404)
      const missing = await as(rafi).get('/orders/my/NW-99999').expect(404)
      expect(someoneElses.body).toEqual(missing.body)
      await as(rafi).get('/orders/my/not-a-number').expect(404)
    })
  })

  describe('saved addresses', () => {
    const home = {
      label: 'Home',
      fullName: 'Rafi Rahman',
      phone: '017 1234-5678',
      division: 'Dhaka',
      district: 'Dhaka',
      area: 'Dhanmondi',
      addressLine1: 'House 12, Road 5',
      postalCode: '1209',
    }
    const office = {
      ...home,
      label: 'Office',
      addressLine1: 'Level 4, Gulshan Avenue',
      area: 'Gulshan',
    }
    const list = async () =>
      (await as(rafi).get('/addresses').expect(200)).body.data as {
        id: string
        label: string
        isDefault: boolean
      }[]
    const defaults = async () => (await list()).filter((a) => a.isDefault).map((a) => a.label)

    it('the first address becomes the default; phone normalised', async () => {
      const res = await as(rafi).post('/addresses', home).expect(201)
      expect(res.body.data).toMatchObject({
        label: 'Home',
        phone: '+8801712345678',
        isDefault: true,
      })
      await as(rafi).post('/addresses', office).expect(201)
      expect(await defaults()).toEqual(['Home'])
    })

    it('exactly one default: making another the default moves it', async () => {
      await as(rafi).post('/addresses', home).expect(201)
      await as(rafi)
        .post('/addresses', { ...office, isDefault: true })
        .expect(201)
      expect(await defaults()).toEqual(['Office'])
      const homeId = (await list()).find((a) => a.label === 'Home')!.id
      await as(rafi).patch(`/addresses/${homeId}`, { isDefault: true }).expect(200)
      expect(await defaults()).toEqual(['Home'])
    })

    it('two "make default" requests at once still leave exactly one default', async () => {
      await as(rafi).post('/addresses', home).expect(201)
      await as(rafi).post('/addresses', office).expect(201)
      const third = (
        await as(rafi)
          .post('/addresses', { ...home, label: 'Parents' })
          .expect(201)
      ).body.data.id
      const officeId = (await list()).find((a) => a.label === 'Office')!.id
      await Promise.all([
        as(rafi).patch(`/addresses/${officeId}`, { isDefault: true }).expect(200),
        as(rafi).patch(`/addresses/${third}`, { isDefault: true }).expect(200),
      ])
      expect(await defaults()).toHaveLength(1)
    })

    it('deleting the default hands it to the newest remaining address', async () => {
      const homeId = (await as(rafi).post('/addresses', home).expect(201)).body.data.id
      await as(rafi).post('/addresses', office).expect(201)
      await as(rafi).delete(`/addresses/${homeId}`).expect(200)
      expect(await defaults()).toEqual(['Office'])
    })

    it('un-defaulting the default hands it on; with no other address it stays', async () => {
      const homeId = (await as(rafi).post('/addresses', home).expect(201)).body.data.id
      await as(rafi).patch(`/addresses/${homeId}`, { isDefault: false }).expect(200)
      expect(await defaults()).toEqual(['Home'])
      await as(rafi).post('/addresses', office).expect(201)
      await as(rafi).patch(`/addresses/${homeId}`, { isDefault: false }).expect(200)
      expect(await defaults()).toEqual(['Office'])
    })

    it('district must be in the division (also when only one of them changes)', async () => {
      await as(rafi)
        .post('/addresses', { ...home, district: 'Sylhet' })
        .expect(400)
      const id = (await as(rafi).post('/addresses', home).expect(201)).body.data.id
      await as(rafi).patch(`/addresses/${id}`, { division: 'Sylhet' }).expect(400)
    })

    it('at most 10', async () => {
      for (let i = 0; i < 10; i++)
        await as(rafi)
          .post('/addresses', { ...home, label: `A${i}` })
          .expect(201)
      const res = await as(rafi).post('/addresses', home).expect(409)
      expect(res.body.error).toBe('ADDRESS_LIMIT')
    })

    it("someone else's address can't be seen, changed or deleted (404, like a missing one)", async () => {
      const id = (await as(rafi).post('/addresses', home).expect(201)).body.data.id
      expect((await as(other).get('/addresses').expect(200)).body.data).toEqual([])
      await as(other).patch(`/addresses/${id}`, { label: 'Mine now' }).expect(404)
      await as(other).delete(`/addresses/${id}`).expect(404)
      expect((await list())[0]).toMatchObject({ id, label: 'Home' })
    })
  })

  describe('wishlist', () => {
    async function shirt(fields: { stock?: number; status?: 'ACTIVE' | 'ARCHIVED' } = {}) {
      const c = await makeCategory()
      const p = await makeProduct({
        categoryId: c.id,
        name: 'Oxford Shirt',
        basePrice: '1490',
        compareAtPrice: '1990',
        status: fields.status,
        variants: [{ size: 'M', color: 'Blue', stock: fields.stock ?? 5 }],
      })
      return p.variants[0]!.id
    }
    const items = async (who = rafi) =>
      (await as(who).get('/wishlist').expect(200)).body.data as object[]

    it("save, list (today's price, stock, photo), save again = still one, remove", async () => {
      const id = await shirt()
      await as(rafi).post('/wishlist', { variantId: id }).expect(200)
      await as(rafi).post('/wishlist', { variantId: id }).expect(200)
      expect(await items()).toEqual([
        expect.objectContaining({
          variantId: id,
          productName: 'Oxford Shirt',
          productSlug: expect.stringMatching(/^oxford-shirt/),
          size: 'M',
          color: 'Blue',
          price: '1490',
          compareAtPrice: '1990',
          inStock: true,
          imageUrl: expect.stringContaining('supabase.co'),
        }),
      ])
      await as(rafi).delete(`/wishlist/${id}`).expect(200)
      await as(rafi).delete(`/wishlist/${id}`).expect(200) // twice is fine
      expect(await items()).toEqual([])
      expect(await items(other)).toEqual([])
    })

    it("sold out stays (marked); archived products drop off; unavailable ones can't be saved", async () => {
      const soldOut = await shirt({ stock: 0 })
      const live = await shirt()
      await as(rafi).post('/wishlist', { variantId: soldOut }).expect(200)
      await as(rafi).post('/wishlist', { variantId: live }).expect(200)
      await db.product.updateMany({
        where: { variants: { some: { id: live } } },
        data: { status: 'ARCHIVED' },
      })
      expect(await items()).toEqual([
        expect.objectContaining({ variantId: soldOut, inStock: false }),
      ])
      await as(rafi).post('/wishlist', { variantId: live }).expect(404)
      await as(rafi).post('/wishlist', { variantId: randomUUID() }).expect(404)
    })

    it("one customer's wishlist is invisible to another", async () => {
      await as(rafi)
        .post('/wishlist', { variantId: await shirt() })
        .expect(200)
      expect(await items(other)).toEqual([])
    })
  })

  describe('profile', () => {
    it('updates name and mobile (normalised); "" clears the mobile; email is not editable here', async () => {
      const res = await as(rafi)
        .patch('/auth/me', { fullName: ' Rafi R. ', phone: '01812345678' })
        .expect(200)
      expect(res.body.data.user).toMatchObject({ fullName: 'Rafi R.', phone: '+8801812345678' })
      expect(
        (await as(rafi).patch('/auth/me', { phone: '' }).expect(200)).body.data.user.phone,
      ).toBeNull()
      await as(rafi).patch('/auth/me', { email: 'new@example.com' }).expect(400)
      await as(rafi).patch('/auth/me', { fullName: '   ' }).expect(400)
    })

    it('change password: needs the current one; then only the new one works', async () => {
      const wrong = await as(rafi)
        .post('/auth/change-password', {
          currentPassword: 'nope',
          newPassword: 'brand-new-password',
        })
        .expect(400)
      expect(wrong.body.error).toBe('WRONG_PASSWORD')
      await as(rafi)
        .post('/auth/change-password', {
          currentPassword: 'test-password-1',
          newPassword: 'brand-new-password',
        })
        .expect(200)
      const login = (password: string) =>
        http().post('/api/v1/auth/login').send({ email: 'rafi@example.com', password })
      await login('test-password-1').expect(401)
      await login('brand-new-password').expect(200)
      await as(rafi)
        .post('/auth/change-password', {
          currentPassword: 'brand-new-password',
          newPassword: 'short',
        })
        .expect(400)
    })
  })
})
