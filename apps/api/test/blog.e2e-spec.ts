// Step 43 — the blog: what the shop may see, and Admin → Content → Blog.
import type { NestExpressApplication } from '@nestjs/platform-express'
import request from 'supertest'
import { createTestApp } from './utils/app.js'
import { makeCategory, makeProduct } from './utils/factories.js'
import { jpegWithGps } from './utils/images.js'
import { resetDatabase, testPrisma } from './utils/test-db.js'

const db = testPrisma()
afterAll(() => db.$disconnect())

const OWN = 'https://test-project.supabase.co/storage/v1/object/public/product-images/content/'
const post = (patch: object = {}) => ({
  title: 'Eid looks 2026',
  slug: 'eid-looks-2026',
  excerpt: 'Panjabis for every day of Eid.',
  content: '## Our picks\n\nCrisp cotton for the morning prayer.',
  tags: ['Eid'],
  ...patch,
})

describe('Blog (step 43)', () => {
  let app: NestExpressApplication
  const http = () => request(app.getHttpServer())
  const create = (body: object) => http().post('/api/v1/admin/blog').send(body)

  beforeEach(async () => {
    await resetDatabase()
    app = await createTestApp({ asAdmin: true })
  })
  afterEach(() => app.close())

  describe('what the shop sees', () => {
    it('a draft is invisible; publishing makes it live (dated now); archived disappears', async () => {
      const draft = (await create(post()).expect(201)).body.data
      expect(draft).toMatchObject({ status: 'DRAFT', publishedAt: null, scheduled: false })
      expect((await http().get('/api/v1/blog/eid-looks-2026').expect(200)).body.data).toBeNull()
      expect((await http().get('/api/v1/blog').expect(200)).body.data.items).toEqual([])

      const live = (
        await http()
          .patch(`/api/v1/admin/blog/${draft.id}`)
          .send(post({ status: 'PUBLISHED' }))
          .expect(200)
      ).body.data
      expect(live.publishedAt).not.toBeNull()
      const shown = (await http().get('/api/v1/blog/eid-looks-2026').expect(200)).body.data
      expect(shown).toMatchObject({
        title: 'Eid looks 2026',
        tags: ['eid'],
        content: expect.stringContaining('Our picks'),
        products: [],
      })

      await http().delete(`/api/v1/admin/blog/${draft.id}`).expect(200)
      expect((await http().get('/api/v1/blog/eid-looks-2026').expect(200)).body.data).toBeNull()
      // Restorable, with its address.
      await http()
        .patch(`/api/v1/admin/blog/${draft.id}`)
        .send(post({ status: 'PUBLISHED' }))
        .expect(200)
      expect((await http().get('/api/v1/blog/eid-looks-2026').expect(200)).body.data).not.toBeNull()
    })

    it('scheduled: published with a future date stays hidden until then', async () => {
      const future = new Date(Date.now() + 24 * 3600_000).toISOString()
      const p = (await create(post({ status: 'PUBLISHED', publishedAt: future })).expect(201)).body
        .data
      expect(p).toMatchObject({ scheduled: true })
      expect((await http().get('/api/v1/blog/eid-looks-2026').expect(200)).body.data).toBeNull()
      expect((await http().get('/api/v1/blog/sitemap').expect(200)).body.data).toEqual([])
      await db.blogPost.update({
        where: { id: p.id },
        data: { publishedAt: new Date(Date.now() - 1000) },
      })
      expect((await http().get('/api/v1/blog/eid-looks-2026').expect(200)).body.data).not.toBeNull()
    })

    it('list: newest first, 12 a page, filter by tag; sitemap lists live posts', async () => {
      for (let i = 1; i <= 13; i++)
        await create(
          post({
            slug: `post-${i}`,
            title: `Post ${i}`,
            tags: i % 2 ? ['eid'] : ['summer'],
            status: 'PUBLISHED',
            publishedAt: new Date(Date.UTC(2026, 8, i)).toISOString(),
          }),
        ).expect(201)
      const first = (await http().get('/api/v1/blog').expect(200)).body.data
      expect(first).toMatchObject({ total: 13, pageSize: 12, totalPages: 2, tag: null })
      expect(first.items[0].slug).toBe('post-13')
      expect(first.items[0]).not.toHaveProperty('content') // cards only
      expect((await http().get('/api/v1/blog?page=2').expect(200)).body.data.items).toHaveLength(1)
      const eid = (await http().get('/api/v1/blog?tag=EID').expect(200)).body.data
      expect(eid).toMatchObject({ total: 7, tag: 'eid' })
      expect((await http().get('/api/v1/blog?tag=%3Cb%3E').expect(200)).body.data).toMatchObject({
        total: 0,
        tag: null,
      })
      expect((await http().get('/api/v1/blog/sitemap').expect(200)).body.data).toHaveLength(13)
    })

    it('Shop the look: chosen products in order — a hidden or deleted one just drops out', async () => {
      const c = await makeCategory()
      const shirt = await makeProduct({ categoryId: c.id, name: 'Shirt' })
      const draft = await makeProduct({ categoryId: c.id, name: 'Draft', status: 'DRAFT' })
      const kurta = await makeProduct({ categoryId: c.id, name: 'Kurta' })
      const hiddenCat = await makeCategory({ isActive: false })
      const hidden = await makeProduct({ categoryId: hiddenCat.id, name: 'In a hidden category' })
      await create(
        post({ status: 'PUBLISHED', productIds: [kurta.id, draft.id, hidden.id, shirt.id] }),
      ).expect(201)
      const shown = (await http().get('/api/v1/blog/eid-looks-2026').expect(200)).body.data
      expect(shown.products.map((p: { name: string }) => p.name)).toEqual(['Kurta', 'Shirt'])
      expect(shown.products[0]).toMatchObject({ slug: kurta.slug, basePrice: '1000' })
      await db.product.delete({ where: { id: kurta.id } }) // the link goes, the post stays
      const after = (await http().get('/api/v1/blog/eid-looks-2026').expect(200)).body.data
      expect(after.products.map((p: { name: string }) => p.name)).toEqual(['Shirt'])
    })
  })

  describe('admin rules', () => {
    it('photos only from our own uploads (cover and inside the text), with their size', async () => {
      const cover = { coverImageUrl: `${OWN}c.jpg`, coverImageAlt: 'Two panjabis' }
      await create(post({ ...cover, content: `![Look](${OWN}a.jpg#w=1200&h=800)` })).expect(201)
      for (const bad of [
        { coverImageUrl: 'https://evil.example/c.jpg', coverImageAlt: 'x' },
        { content: '![x](https://evil.example/a.jpg#w=10&h=10)' },
        { content: `![x](${OWN}a.jpg)` }, // no size → not from "Insert photo"
      ]) {
        const r = await create(
          post({ slug: `p-${Math.random().toString(36).slice(2, 7)}`, ...bad }),
        )
        expect(r.status).toBe(400)
        expect(r.body.message).toMatch(/other websites/)
      }
    })

    it('a cover needs a description; addresses are unique; tags and products are limited', async () => {
      const r = await create(post({ coverImageUrl: `${OWN}c.jpg` })).expect(400)
      expect(r.body.details.join(' ')).toMatch(/Describe the cover photo/)
      await create(post()).expect(201)
      expect((await create(post()).expect(409)).body.error).toBe('SLUG_TAKEN')
      await create(
        post({ slug: 'x-1', tags: Array.from({ length: 11 }, (_, i) => `t${i}`) }),
      ).expect(400)
      await create(
        post({ slug: 'x-2', productIds: ['6f1e2c3a-1b2c-4d5e-8f90-123456789abc'] }),
      ).expect(400)
    })

    it('admin list: drafts and published (archived when asked); scheduled marked', async () => {
      await create(post({ slug: 'a' })).expect(201)
      const b = (await create(post({ slug: 'b', status: 'PUBLISHED' })).expect(201)).body.data
      await http().delete(`/api/v1/admin/blog/${b.id}`).expect(200)
      const list = (await http().get('/api/v1/admin/blog').expect(200)).body.data
      expect(list.map((r: { slug: string }) => r.slug)).toEqual(['a'])
      const archived = (await http().get('/api/v1/admin/blog?status=ARCHIVED').expect(200)).body
        .data
      expect(archived.map((r: { slug: string }) => r.slug)).toEqual(['b'])
    })

    it('the photo upload also answers the size (the editor writes it into the post)', async () => {
      const r = await http()
        .post('/api/v1/admin/content/images')
        .attach('file', await jpegWithGps(64, 48), 'photo.jpg')
        .expect(201)
      expect(r.body.data).toMatchObject({
        url: expect.stringContaining('/content/'),
        width: 64,
        height: 48,
      })
    })

    it('Staff may write posts; signed-out visitors may not', async () => {
      const staff = await createTestApp({ asAdmin: true, role: 'STAFF' })
      const outsider = await createTestApp({ asAdmin: false })
      try {
        await request(staff.getHttpServer()).post('/api/v1/admin/blog').send(post()).expect(201)
        await request(outsider.getHttpServer()).get('/api/v1/admin/blog').expect(401)
      } finally {
        await staff.close()
        await outsider.close()
      }
    })
  })
})
