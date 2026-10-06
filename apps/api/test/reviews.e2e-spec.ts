// HTTP tests for /api/v1/reviews (step 24). Real nowoll_test DB, fake Supabase Auth.
// Orders are marked DELIVERED directly in the database — the admin screen that
// does it for real arrives in Phase 5.
import { randomUUID } from 'node:crypto'
import type { NestExpressApplication } from '@nestjs/platform-express'
import request from 'supertest'
import { signUp } from './utils/auth.js'
import { createTestApp } from './utils/app.js'
import { makeCategory, makeProduct, seedShippingZones } from './utils/factories.js'
import { resetDatabase, testPrisma } from './utils/test-db.js'

const db = testPrisma()
afterAll(() => db.$disconnect())

describe('/reviews', () => {
  let app: NestExpressApplication
  let admin: NestExpressApplication
  let rafi: { cookie: string; userId: string }
  let productId: string
  let variantId: string
  const http = () => request(app.getHttpServer())
  const write = (who: { cookie: string }, body: object) =>
    http().post('/api/v1/reviews').set('Cookie', who.cookie).send(body)
  const review = (over: object = {}) => ({
    productId,
    rating: 5,
    title: 'Lovely fabric',
    body: 'Fits well and the cotton feels great.',
    ...over,
  })
  const publicList = (query = '') => http().get(`/api/v1/reviews/product/${productId}${query}`)

  /** A signed-in order for one shirt; optionally marked delivered. */
  async function buy(who: { cookie: string }, delivered = true) {
    const res = await http()
      .post('/api/v1/orders')
      .set('Idempotency-Key', randomUUID())
      .set('Cookie', who.cookie)
      .send({
        items: [{ variantId, quantity: 1 }],
        contact: { fullName: 'Rafi Rahman', email: 'rafi@example.com', phone: '01712345678' },
        address: { division: 'Dhaka', district: 'Dhaka', addressLine1: 'House 12, Road 5' },
        paymentMethod: 'COD',
        expectedTotal: '1550',
      })
      .expect(201)
    if (delivered)
      await db.order.update({
        where: { id: res.body.data.orderId },
        data: { status: 'DELIVERED', deliveredAt: new Date() },
      })
    return res.body.data.orderId as string
  }

  beforeEach(async () => {
    await resetDatabase()
    await seedShippingZones()
    app = await createTestApp({ asAdmin: false })
    admin = await createTestApp({ asAdmin: true })
    rafi = await signUp(app, 'rafi@example.com', { fullName: 'Rafi Rahman' })
    const c = await makeCategory()
    const p = await makeProduct({
      categoryId: c.id,
      basePrice: '1490',
      variants: [{ size: 'M', color: 'Blue', stock: 20 }],
    })
    productId = p.id
    variantId = p.variants[0]!.id
  })
  afterEach(async () => {
    await app.close()
    await admin.close()
  })

  describe('writing a review (verified buyers only)', () => {
    it('201 after a delivered order; it waits for approval and is not public yet', async () => {
      await buy(rafi)
      const res = await write(rafi, review()).expect(201)
      expect(res.body.data).toMatchObject({
        productId,
        rating: 5,
        status: 'PENDING',
        rejectionReason: null,
      })
      expect((await publicList().expect(200)).body.data).toMatchObject({
        total: 0,
        summary: { average: null, count: 0 },
      })
    })

    it('refused without a delivered order containing the product — not delivered yet, or never bought', async () => {
      await write(rafi, review()).expect(403) // never bought
      await buy(rafi, false) // placed, not delivered
      const res = await write(rafi, review()).expect(403)
      expect(res.body.error).toBe('NOT_A_VERIFIED_BUYER')
      const other = await signUp(app, 'other@example.com')
      await buy(rafi) // Rafi's delivered order doesn't make OTHER a verified buyer
      await write(other, review()).expect(403)
    })

    it('needs a sign-in; rating 1–5, 10–2000 characters, title ≤ 100', async () => {
      await http().post('/api/v1/reviews').send(review()).expect(401)
      await buy(rafi)
      await write(rafi, review({ rating: 0 })).expect(400)
      await write(rafi, review({ rating: 6 })).expect(400)
      await write(rafi, review({ rating: 4.5 })).expect(400)
      await write(rafi, review({ body: 'Too short' })).expect(400)
      await write(rafi, review({ body: 'x'.repeat(2001) })).expect(400)
      await write(rafi, review({ title: 'x'.repeat(101) })).expect(400)
      await write(rafi, review({ productId: randomUUID() })).expect(404)
    })

    it('one review per product: writing again EDITS it and sends it back for approval', async () => {
      await buy(rafi)
      const first = await write(rafi, review()).expect(201)
      await admin_(`/reviews/${first.body.data.id}/approve`).expect(200)
      expect((await publicList()).body.data.total).toBe(1)

      const edited = await write(
        rafi,
        review({ rating: 3, body: 'Shrank a little after washing.' }),
      ).expect(201)
      expect(edited.body.data).toMatchObject({
        id: first.body.data.id,
        rating: 3,
        status: 'PENDING',
      })
      expect(await db.review.count()).toBe(1)
      expect((await publicList()).body.data.total).toBe(0) // the edit isn't public until approved again
    })
  })

  describe('moderation (admin)', () => {
    it('admin routes are refused without admin access', async () => {
      await http().get('/api/v1/reviews').expect(401)
      await http().patch(`/api/v1/reviews/${randomUUID()}/approve`).expect(401)
      await http().patch(`/api/v1/reviews/${randomUUID()}/reject`).send({ reason: 'x' }).expect(401)
    })

    it('waiting reviews, oldest first, with who wrote them and the order', async () => {
      await buy(rafi)
      await write(rafi, review()).expect(201)
      const res = await request(admin.getHttpServer()).get('/api/v1/reviews').expect(200)
      expect(res.body.data).toMatchObject({ total: 1, pageSize: 20 })
      expect(res.body.data.items[0]).toMatchObject({
        status: 'PENDING',
        product: { id: productId },
        author: { email: 'rafi@example.com', name: 'Rafi Rahman' },
        orderNumber: 10001,
      })
    })

    it('rejecting needs a reason; the customer sees it and can edit to try again', async () => {
      await buy(rafi)
      const { id } = (await write(rafi, review()).expect(201)).body.data
      await admin_(`/reviews/${id}/reject`, {}).expect(400)
      await admin_(`/reviews/${id}/reject`, {
        reason: 'Please leave out the phone number.',
      }).expect(200)

      const mine = await http().get('/api/v1/reviews/my').set('Cookie', rafi.cookie).expect(200)
      expect(mine.body.data).toEqual([
        expect.objectContaining({
          id,
          status: 'REJECTED',
          rejectionReason: 'Please leave out the phone number.',
        }),
      ])
      const again = await write(rafi, review({ body: 'Fits well, cotton feels great.' })).expect(
        201,
      )
      expect(again.body.data).toMatchObject({ status: 'PENDING', rejectionReason: null })
    })

    it('a missing review is a 404', async () => {
      await admin_(`/reviews/${randomUUID()}/approve`).expect(404)
    })
  })

  describe('on the product page (public)', () => {
    async function approvedReview(email: string, fullName: string | undefined, rating: number) {
      const who = await signUp(app, email, fullName ? { fullName } : {})
      await buy(who)
      const { id } = (await write(who, review({ rating })).expect(201)).body.data
      await admin_(`/reviews/${id}/approve`).expect(200)
      return who
    }

    it('only approved reviews; first name + last initial; average and breakdown', async () => {
      await approvedReview('a@example.com', 'Rafi Rahman', 5)
      await approvedReview('b@example.com', 'Nusrat', 4)
      await approvedReview('c@example.com', 'Tanvir Ahmed Khan', 4)
      await buy(rafi)
      await write(rafi, review({ rating: 1 })).expect(201) // pending — not counted

      const res = await publicList().expect(200)
      expect(res.body.data.summary).toEqual({
        average: 4.3,
        count: 3,
        breakdown: { '1': 0, '2': 0, '3': 0, '4': 2, '5': 1 },
      })
      expect(res.body.data.items.map((r: { author: string }) => r.author)).toEqual([
        'Tanvir K.',
        'Nusrat',
        'Rafi R.',
      ])
      expect(JSON.stringify(res.body.data)).not.toMatch(/@example\.com|Rahman/)
    })

    it('pages: 5 at a time by default', async () => {
      for (let i = 0; i < 6; i++) await approvedReview(`p${i}@example.com`, `Person ${i}`, 5)
      expect((await publicList()).body.data).toMatchObject({ total: 6, pageSize: 5, totalPages: 2 })
      expect((await publicList('?page=2')).body.data.items).toHaveLength(1)
    }, 30_000)

    it("a banned customer's reviews disappear; an archived product has no review page", async () => {
      const banned = await approvedReview('banned@example.com', 'Spam Bot', 1)
      await approvedReview('ok@example.com', 'Good Customer', 5)
      await db.user.update({ where: { id: banned.userId }, data: { status: 'BANNED' } })
      expect((await publicList()).body.data.summary).toMatchObject({ count: 1, average: 5 })
      await db.product.update({ where: { id: productId }, data: { status: 'ARCHIVED' } })
      await publicList().expect(404)
    })
  })

  function admin_(path: string, body: object = {}) {
    return request(admin.getHttpServer()).patch(`/api/v1${path}`).send(body)
  }
})
