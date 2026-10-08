// Step 32: customer accounts in the admin panel, and what a ban does.
//   • only CUSTOMER accounts are listed (never staff); "spent" counts sales only
//   • the customer page shows their account orders + staff-only guest orders
//     with the same email or phone
//   • a ban: their session is refused on the next request, sign-in is refused,
//     and guest checkout with the same email OR phone is refused
import { randomUUID } from 'node:crypto'
import type { NestExpressApplication } from '@nestjs/platform-express'
import request from 'supertest'
import { signInAsStaff, staffAccount } from './utils/admin.js'
import { signUp } from './utils/auth.js'
import { createTestApp } from './utils/app.js'
import { makeCategory, makeProduct, seedShippingZones } from './utils/factories.js'
import { resetDatabase, testPrisma } from './utils/test-db.js'

const db = testPrisma()
afterAll(() => db.$disconnect())

describe('admin customers (step 32)', () => {
  let app: NestExpressApplication
  let variantId: string
  const http = () => request(app.getHttpServer())
  const n = () => Math.floor(Math.random() * 250) + 1

  // A fresh app per test: its pretend Supabase keeps accounts in memory, and
  // every test signs up the same emails.
  beforeEach(async () => {
    app = await createTestApp({ asAdmin: true })
    await resetDatabase()
    await seedShippingZones()
    const c = await makeCategory()
    const p = await makeProduct({
      categoryId: c.id,
      basePrice: '1000',
      variants: [{ size: 'M', color: 'Blue', stock: 100 }],
    })
    variantId = p.variants[0]!.id
  })
  afterEach(() => app.close())

  /** An order through checkout (1 × ৳1000 + ৳60 delivery = ৳1060). Signed in when a cookie is given. */
  function order(contact: { email: string; phone: string; fullName?: string }, cookie?: string) {
    const req = http()
      .post('/api/v1/orders')
      .set('Idempotency-Key', randomUUID())
      .set('X-Forwarded-For', `10.1.${n()}.${n()}`)
    return (cookie ? req.set('Cookie', cookie) : req).send({
      items: [{ variantId, quantity: 1 }],
      contact: { fullName: contact.fullName ?? 'Buyer', ...contact },
      address: { division: 'Dhaka', district: 'Dhaka', addressLine1: 'House 1' },
      paymentMethod: 'COD',
      expectedTotal: '1060',
    })
  }
  const confirm = (id: string) =>
    http()
      .patch(`/api/v1/orders/${id}/status`)
      .send({ from: 'PENDING', to: 'CONFIRMED' })
      .expect(200)

  describe('list', () => {
    it('customers only (never staff); spent = sales only; counts and last order', async () => {
      const rafi = await signUp(app, 'rafi@example.com', {
        fullName: 'Rafi Rahman',
        phone: '01712345678',
      })
      const nadia = await signUp(app, 'nadia@example.com', { fullName: 'Nadia Islam' })
      await staffAccount(app, 'staff@nowoll.com', 'STAFF')

      const a = await order(
        { email: 'rafi@example.com', phone: '01712345678' },
        rafi.cookie,
      ).expect(201)
      await confirm(a.body.data.orderId) // a sale: ৳1060
      await order({ email: 'rafi@example.com', phone: '01712345678' }, rafi.cookie).expect(201) // pending: not "spent"

      const res = (await http().get('/api/v1/admin/customers').expect(200)).body.data
      expect(res.items.map((c: { email: string }) => c.email)).toEqual([
        'nadia@example.com',
        'rafi@example.com',
      ])
      expect(res.items[1]).toMatchObject({
        id: rafi.userId,
        name: 'Rafi Rahman',
        phone: '+8801712345678',
        status: 'ACTIVE',
        orderCount: 2,
        totalSpent: '1060',
        lastOrderAt: expect.any(String),
      })
      expect(res.items[0]).toMatchObject({
        id: nadia.userId,
        orderCount: 0,
        totalSpent: '0',
        lastOrderAt: null,
      })
    })

    it('search by name, email or phone (any format); filter by status; sorting; pages', async () => {
      const rafi = await signUp(app, 'rafi@example.com', {
        fullName: 'Rafi Rahman',
        phone: '01712345678',
      })
      const nadia = await signUp(app, 'nadia@example.com', {
        fullName: 'Nadia Islam',
        phone: '01898765432',
      })
      const sale = await order(
        { email: 'nadia@example.com', phone: '01898765432' },
        nadia.cookie,
      ).expect(201)
      await confirm(sale.body.data.orderId)
      await db.user.update({
        where: { id: rafi.userId },
        data: { status: 'BANNED', bannedReason: 'x' },
      })

      const ids = async (q: string) =>
        (await http().get(`/api/v1/admin/customers?${q}`).expect(200)).body.data.items.map(
          (c: { id: string }) => c.id,
        )
      expect(await ids('q=nadia')).toEqual([nadia.userId])
      expect(await ids('q=RAFI%40example')).toEqual([rafi.userId])
      expect(await ids('q=01712-345678')).toEqual([rafi.userId])
      expect(await ids('q=%2B8801898765432')).toEqual([nadia.userId])
      expect(await ids('q=%25')).toEqual([]) // "%" is matched literally — not "match everyone"
      expect(await ids('status=BANNED')).toEqual([rafi.userId])
      expect(await ids('sort=spent')).toEqual([nadia.userId, rafi.userId])
      expect(await ids('sort=name')).toEqual([nadia.userId, rafi.userId])
      const page2 = (await http().get('/api/v1/admin/customers?pageSize=1&page=2').expect(200)).body
        .data
      expect(page2).toMatchObject({ total: 2, page: 2, totalPages: 2 })
      expect(page2.items).toHaveLength(1)
      await http().get('/api/v1/admin/customers?sort=random').expect(400)
    })
  })

  describe('one customer', () => {
    it('account orders, staff-only guest orders with the same email or phone, stats, addresses', async () => {
      const rafi = await signUp(app, 'rafi@example.com', { fullName: 'Rafi', phone: '01712345678' })
      const mine = await order(
        { email: 'rafi@example.com', phone: '01712345678' },
        rafi.cookie,
      ).expect(201)
      await confirm(mine.body.data.orderId)
      const guestByEmail = await order({ email: 'RAFI@example.com', phone: '01999999999' }).expect(
        201,
      )
      const guestByPhone = await order({ email: 'other@example.com', phone: '01712345678' }).expect(
        201,
      )
      await order({ email: 'stranger@example.com', phone: '01555555555' }).expect(201) // not theirs
      await http()
        .post('/api/v1/addresses')
        .set('Cookie', rafi.cookie)
        .send({
          fullName: 'Rafi',
          phone: '01712345678',
          addressLine1: 'House 12',
          district: 'Dhaka',
          division: 'Dhaka',
        })
        .expect(201)

      const d = (await http().get(`/api/v1/admin/customers/${rafi.userId}`).expect(200)).body.data
      expect(d).toMatchObject({
        name: 'Rafi',
        email: 'rafi@example.com',
        status: 'ACTIVE',
        ban: null,
      })
      expect(d.orders.map((o: { id: string }) => o.id)).toEqual([mine.body.data.orderId])
      expect(d.guestOrders.map((o: { id: string }) => o.id).sort()).toEqual(
        [guestByEmail.body.data.orderId, guestByPhone.body.data.orderId].sort(),
      )
      expect(d.stats).toMatchObject({
        orderCount: 1,
        totalSpent: '1060',
        averageOrder: '1060',
        reviewCount: 0,
        returnCount: 0,
      })
      expect(d.addresses).toEqual([
        expect.objectContaining({ line1: 'House 12', district: 'Dhaka' }),
      ])
    })

    it('staff accounts and unknown ids → 404', async () => {
      const staff = await staffAccount(app, 'staff@nowoll.com', 'ADMIN')
      await http().get(`/api/v1/admin/customers/${staff.id}`).expect(404)
      await http().get('/api/v1/admin/customers/00000000-0000-4000-8000-000000000000').expect(404)
    })
  })

  describe('banning', () => {
    it('reason required; the open session is refused on its next request; sign-in refused', async () => {
      const rafi = await signUp(app, 'rafi@example.com', { phone: '01712345678' })
      await http().get('/api/v1/auth/me').set('Cookie', rafi.cookie).expect(200)

      await http()
        .patch(`/api/v1/admin/customers/${rafi.userId}/ban`)
        .send({ reason: '  ' })
        .expect(400)
      const banned = (
        await http()
          .patch(`/api/v1/admin/customers/${rafi.userId}/ban`)
          .send({ reason: 'Refused 3 COD parcels' })
          .expect(200)
      ).body.data
      expect(banned).toMatchObject({
        status: 'BANNED',
        ban: { reason: 'Refused 3 COD parcels', at: expect.any(String) },
      })

      const me = await http().get('/api/v1/auth/me').set('Cookie', rafi.cookie).expect(403)
      expect(me.body.error).toBe('ACCOUNT_DISABLED')
      expect(me.body.message).not.toMatch(/COD/) // the reason stays with staff
      await http()
        .post('/api/v1/auth/login')
        .set('X-Forwarded-For', `10.2.${n()}.${n()}`)
        .send({ email: 'rafi@example.com', password: 'test-password-1' })
        .expect(403)
      await http()
        .patch(`/api/v1/admin/customers/${rafi.userId}/ban`)
        .send({ reason: 'again' })
        .expect(409)
    })

    it('guest checkout with the banned email OR phone is refused; other people are fine', async () => {
      const rafi = await signUp(app, 'rafi@example.com', { phone: '01712345678' })
      await http()
        .patch(`/api/v1/admin/customers/${rafi.userId}/ban`)
        .send({ reason: 'Fake orders' })
        .expect(200)

      const byEmail = await order({ email: 'Rafi@Example.com', phone: '01999999999' }).expect(403)
      expect(byEmail.body).toMatchObject({ error: 'ORDER_REFUSED' })
      expect(byEmail.body.message).not.toMatch(/ban|account/i) // says nothing about the ban
      await order({ email: 'new@example.com', phone: '017-1234-5678' }).expect(403) // same phone, other format
      await order({ email: 'someone@example.com', phone: '01888888888' }).expect(201)
      expect(await db.order.count()).toBe(1) // nothing was created for the refused ones
    })

    it('unban: signs in and orders again; the ban details are cleared', async () => {
      const rafi = await signUp(app, 'rafi@example.com', { phone: '01712345678' })
      await http().patch(`/api/v1/admin/customers/${rafi.userId}/unban`).expect(409) // not banned
      await http()
        .patch(`/api/v1/admin/customers/${rafi.userId}/ban`)
        .send({ reason: 'Mistake' })
        .expect(200)
      const d = (await http().patch(`/api/v1/admin/customers/${rafi.userId}/unban`).expect(200))
        .body.data
      expect(d).toMatchObject({ status: 'ACTIVE', ban: null })
      expect(await db.user.findUniqueOrThrow({ where: { id: rafi.userId } })).toMatchObject({
        bannedReason: null,
        bannedAt: null,
        bannedById: null,
      })
      await http().get('/api/v1/auth/me').set('Cookie', rafi.cookie).expect(200)
      await order({ email: 'rafi@example.com', phone: '01712345678' }).expect(201)
    })

    it('staff can’t be banned from the customers page', async () => {
      const staff = await staffAccount(app, 'staff@nowoll.com', 'STAFF')
      await http()
        .patch(`/api/v1/admin/customers/${staff.id}/ban`)
        .send({ reason: 'x' })
        .expect(404)
      expect((await db.user.findUniqueOrThrow({ where: { id: staff.id } })).status).toBe('ACTIVE')
    })
  })

  it('who banned: the staff member’s name is recorded (real admin sign-in)', async () => {
    const real = await createTestApp({ asAdmin: false })
    try {
      const rafi = await signUp(real, 'rafi@example.com')
      const { cookie, userId } = await signInAsStaff(real, 'boss@nowoll.com')
      const res = await request(real.getHttpServer())
        .patch(`/api/v1/admin/customers/${rafi.userId}/ban`)
        .set('Cookie', cookie)
        .send({ reason: 'Abusive messages' })
        .expect(200)
      expect(res.body.data.ban).toMatchObject({ reason: 'Abusive messages', by: 'Rafi' })
      expect((await db.user.findUniqueOrThrow({ where: { id: rafi.userId } })).bannedById).toBe(
        userId,
      )
    } finally {
      await real.close()
    }
  })

  it('admin-only', async () => {
    const outsider = await createTestApp({ asAdmin: false })
    try {
      const id = '00000000-0000-4000-8000-000000000000'
      const h = () => request(outsider.getHttpServer())
      await h().get('/api/v1/admin/customers').expect(401)
      await h().get(`/api/v1/admin/customers/${id}`).expect(401)
      await h().patch(`/api/v1/admin/customers/${id}/ban`).send({ reason: 'x' }).expect(401)
      await h().patch(`/api/v1/admin/customers/${id}/unban`).expect(401)
    } finally {
      await outsider.close()
    }
  })
})
