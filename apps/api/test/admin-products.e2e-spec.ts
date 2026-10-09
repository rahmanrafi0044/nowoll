// Step 30a: the admin product list and bulk actions.
//   • the admin list shows drafts too (archived only when asked) — the shop list never does
//   • bulk actions use the normal rules, one product at a time: a product that
//     can't be published fails ON ITS OWN, with the reason, and the rest succeed
import type { NestExpressApplication } from '@nestjs/platform-express'
import request from 'supertest'
import { createTestApp } from './utils/app.js'
import { makeCategory, makeProduct } from './utils/factories.js'
import { resetDatabase, testPrisma } from './utils/test-db.js'

const db = testPrisma()
afterAll(() => db.$disconnect())

describe('admin products (step 30a)', () => {
  let app: NestExpressApplication
  const http = () => request(app.getHttpServer())
  const list = (query = '') => http().get(`/api/v1/admin/products${query}`).expect(200)
  const bulk = (action: string, ids: string[]) =>
    http().post('/api/v1/admin/products/bulk').send({ action, ids })

  beforeAll(async () => {
    app = await createTestApp({ asAdmin: true })
  })
  afterAll(() => app.close())
  beforeEach(async () => {
    await resetDatabase()
    await db.setting.create({ data: { key: 'low_stock_threshold', value: 3 } })
  })

  describe('list', () => {
    it('drafts and live products by default; archived only when asked; the shop list unchanged', async () => {
      const c = await makeCategory({ name: 'Men' })
      const live = await makeProduct({ categoryId: c.id, name: 'Live Shirt' })
      const draft = await makeProduct({ categoryId: c.id, name: 'Draft Shirt', status: 'DRAFT' })
      const archived = await makeProduct({
        categoryId: c.id,
        name: 'Old Shirt',
        status: 'ARCHIVED',
      })
      await db.product.update({ where: { id: archived.id }, data: { deletedAt: new Date() } })

      const names = async (q: string) =>
        (await list(q)).body.data.items.map((p: { name: string }) => p.name).sort()
      expect(await names('')).toEqual(['Draft Shirt', 'Live Shirt'])
      expect(await names('?status=DRAFT')).toEqual(['Draft Shirt'])
      expect(await names('?status=ARCHIVED')).toEqual(['Old Shirt'])
      expect(await names('?status=all')).toEqual(['Draft Shirt', 'Live Shirt', 'Old Shirt'])

      const shop = await http().get('/api/v1/products').expect(200)
      expect(shop.body.data.items.map((p: { id: string }) => p.id)).toEqual([live.id])
      expect(draft.id).toBeDefined()
    })

    it('one row has everything the list needs: stock, low-stock count, photo, publishable', async () => {
      const c = await makeCategory({ name: 'Men' })
      const p = await makeProduct({
        categoryId: c.id,
        name: 'Oxford Shirt',
        basePrice: '1490',
        compareAtPrice: '1990',
        variants: [
          { size: 'S', color: 'Blue', stock: 2 }, // low (≤ 3)
          { size: 'M', color: 'Blue', stock: 10 },
          { size: 'L', color: 'Blue', stock: 0, isActive: false }, // inactive: not counted
        ],
      })
      const row = (await list()).body.data.items[0]
      expect(row).toEqual({
        id: p.id,
        name: 'Oxford Shirt',
        slug: p.slug,
        status: 'ACTIVE',
        isFeatured: false,
        category: { id: c.id, name: 'Men' },
        basePrice: '1490',
        compareAtPrice: '1990',
        image: { url: p.images[0]!.url, altText: 'Oxford Shirt photo' },
        imageCount: 1,
        variantCount: 2,
        totalStock: 12,
        lowStockVariants: 1,
        publishable: true,
        updatedAt: expect.any(String),
      })
    })

    it('a draft with no photo is not publishable', async () => {
      const c = await makeCategory()
      await makeProduct({ categoryId: c.id, status: 'DRAFT', withImage: false })
      const row = (await list()).body.data.items[0]
      expect(row).toMatchObject({ image: null, imageCount: 0, publishable: false })
    })

    it('search: name, slug or a variant SKU (any case)', async () => {
      const c = await makeCategory()
      const shirt = await makeProduct({ categoryId: c.id, name: 'Oxford Shirt' })
      await makeProduct({ categoryId: c.id, name: 'Chino Trousers' })
      const ids = async (q: string) =>
        (await list(`?q=${encodeURIComponent(q)}`)).body.data.items.map((p: { id: string }) => p.id)
      expect(await ids('oxford')).toEqual([shirt.id])
      expect(await ids(shirt.variants[0]!.sku.toLowerCase())).toEqual([shirt.id])
      expect(await ids('nothing-like-this')).toEqual([])
    })

    it('filters: category and low stock (own limit, or the store-wide one)', async () => {
      const men = await makeCategory({ name: 'Men' })
      const kids = await makeCategory({ name: 'Kids' })
      const low = await makeProduct({
        categoryId: men.id,
        variants: [{ size: 'M', color: 'B', stock: 3 }],
      })
      await makeProduct({ categoryId: men.id, variants: [{ size: 'M', color: 'B', stock: 4 }] })
      const ownLimit = await makeProduct({
        categoryId: kids.id,
        variants: [{ size: 'M', color: 'B', stock: 8 }],
      })
      await db.productVariant.update({
        where: { id: ownLimit.variants[0]!.id },
        data: { lowStockThreshold: 10 },
      })
      await makeProduct({
        categoryId: kids.id,
        variants: [{ size: 'M', color: 'B', stock: 0, isActive: false }], // inactive: ignored
      })

      const ids = async (q: string) =>
        (await list(q)).body.data.items.map((p: { id: string }) => p.id).sort()
      expect(await ids('?lowStock=true')).toEqual([low.id, ownLimit.id].sort())
      expect(await ids(`?lowStock=true&categoryId=${kids.id}`)).toEqual([ownLimit.id])
    })

    it('sorting and pages (no row repeated or skipped)', async () => {
      const c = await makeCategory()
      for (const [name, price] of [
        ['B', '300'],
        ['A', '100'],
        ['C', '200'],
      ] as const)
        await makeProduct({ categoryId: c.id, name, basePrice: price })
      const names = async (q: string) =>
        (await list(q)).body.data.items.map((p: { name: string }) => p.name)
      expect(await names('?sort=name')).toEqual(['A', 'B', 'C'])
      expect(await names('?sort=price_desc')).toEqual(['B', 'C', 'A'])
      const page2 = (await list('?sort=name&pageSize=2&page=2')).body.data
      expect(page2).toMatchObject({ total: 3, page: 2, pageSize: 2, totalPages: 2 })
      expect(page2.items.map((p: { name: string }) => p.name)).toEqual(['C'])
    })

    it('rejects bad queries', async () => {
      for (const q of ['status=deleted', 'sort=random', 'pageSize=101', 'categoryId=abc'])
        await http().get(`/api/v1/admin/products?${q}`).expect(400)
    })
  })

  describe('one product (the edit page)', () => {
    const detail = (id: string) => http().get(`/api/v1/admin/products/${id}`)

    it('everything in one answer: inactive variants (with exact stock), photos in order; deleted variants gone', async () => {
      const c = await makeCategory({ name: 'Men' })
      const p = await makeProduct({
        categoryId: c.id,
        name: 'Oxford Shirt',
        status: 'DRAFT',
        basePrice: '1490',
        description: 'Line one\nLine two',
        tags: ['cotton'],
        variants: [
          { size: 'M', color: 'Blue', stock: 7, price: '1590' },
          { size: 'L', color: 'Blue', stock: 0, isActive: false },
          { size: 'XL', color: 'Blue', stock: 3 },
        ],
      })
      await db.productVariant.update({
        where: { id: p.variants[2]!.id },
        data: { deletedAt: new Date(), isActive: false },
      })
      await db.productImage.create({
        data: {
          productId: p.id,
          url: 'https://example.supabase.co/second.jpg',
          storagePath: 'products/second.jpg',
          altText: 'Back view',
          sortOrder: 5,
          variantId: p.variants[0]!.id,
        },
      })

      const d = (await detail(p.id).expect(200)).body.data
      expect(d).toMatchObject({
        id: p.id,
        name: 'Oxford Shirt',
        status: 'DRAFT',
        category: { id: c.id, name: 'Men' },
        basePrice: '1490',
        description: 'Line one\nLine two',
        tags: ['cotton'],
        missingToPublish: [],
      })
      expect(
        d.variants.map(
          (v: { size: string; stock: number; isActive: boolean; price: string | null }) => [
            v.size,
            v.stock,
            v.isActive,
            v.price,
          ],
        ),
      ).toEqual([
        ['M', 7, true, '1590'],
        ['L', 0, false, null],
      ])
      expect(
        d.images.map((i: { altText: string; sortOrder: number }) => [i.altText, i.sortOrder]),
      ).toEqual([
        ['Oxford Shirt photo', 0],
        ['Back view', 5],
      ])
      expect(d.images[1].variantId).toBe(p.variants[0]!.id)
    })

    it('says what is missing before it can go live (inactive variants do not count)', async () => {
      const c = await makeCategory()
      const p = await makeProduct({
        categoryId: c.id,
        status: 'DRAFT',
        withImage: false,
        variants: [{ size: 'M', color: 'B', isActive: false }],
      })
      expect((await detail(p.id).expect(200)).body.data.missingToPublish).toEqual([
        'variant',
        'image',
      ])
    })

    it('archived products open too (read-only use); unknown id → 404; bad id → 400', async () => {
      const c = await makeCategory()
      const p = await makeProduct({ categoryId: c.id, status: 'ARCHIVED' })
      await db.product.update({ where: { id: p.id }, data: { deletedAt: new Date() } })
      expect((await detail(p.id).expect(200)).body.data.status).toBe('ARCHIVED')
      await detail('00000000-0000-4000-8000-000000000000').expect(404)
      await detail('not-an-id').expect(400)
    })
  })

  describe('bulk actions', () => {
    it('publish: ready products go live; one with no photo fails on its own, with the reason', async () => {
      const c = await makeCategory()
      const ready = await makeProduct({ categoryId: c.id, status: 'DRAFT' })
      const noPhoto = await makeProduct({
        categoryId: c.id,
        name: 'No Photo Yet',
        status: 'DRAFT',
        withImage: false,
      })
      const res = await bulk('publish', [ready.id, noPhoto.id]).expect(200)
      expect(res.body.data).toEqual({
        action: 'publish',
        succeeded: [ready.id],
        failed: [
          { id: noPhoto.id, name: 'No Photo Yet', reason: expect.stringMatching(/needs an image/) },
        ],
      })
      expect((await db.product.findUniqueOrThrow({ where: { id: ready.id } })).status).toBe(
        'ACTIVE',
      )
      expect((await db.product.findUniqueOrThrow({ where: { id: noPhoto.id } })).status).toBe(
        'DRAFT',
      )
    })

    it('unpublish, feature, unfeature', async () => {
      const c = await makeCategory()
      const p = await makeProduct({ categoryId: c.id })
      await bulk('feature', [p.id]).expect(200)
      expect((await db.product.findUniqueOrThrow({ where: { id: p.id } })).isFeatured).toBe(true)
      await bulk('unfeature', [p.id]).expect(200)
      await bulk('unpublish', [p.id]).expect(200)
      expect(await db.product.findUniqueOrThrow({ where: { id: p.id } })).toMatchObject({
        status: 'DRAFT',
        isFeatured: false,
      })
    })

    it('move: products go to another category — e.g. to empty a category before archiving it (step 36b)', async () => {
      const from = await makeCategory({ name: 'Old' })
      const to = await makeCategory({ name: 'New' })
      const a = await makeProduct({ categoryId: from.id })
      const b = await makeProduct({ categoryId: from.id, status: 'DRAFT' })
      const move = (body: object) => http().post('/api/v1/admin/products/bulk').send(body)
      const res = await move({ action: 'move', ids: [a.id, b.id], categoryId: to.id }).expect(200)
      expect(res.body.data).toEqual({ action: 'move', succeeded: [a.id, b.id], failed: [] })
      expect(await db.product.count({ where: { categoryId: to.id } })).toBe(2)
      expect(await db.product.findUniqueOrThrow({ where: { id: b.id } })).toMatchObject({
        status: 'DRAFT', // only the category changes
      })
      // …and now the old category can be archived.
      await http().delete(`/api/v1/categories/${from.id}`).expect(200)

      await move({ action: 'move', ids: [a.id] }).expect(400) // where to?
      await move({ action: 'feature', ids: [a.id], categoryId: to.id }).expect(400) // only for move
      const gone = await makeCategory()
      await db.category.update({ where: { id: gone.id }, data: { deletedAt: new Date() } })
      const r = await move({ action: 'move', ids: [a.id], categoryId: gone.id }).expect(400)
      expect(r.body.message).toMatch(/no longer exists/)
      expect((await db.product.findUniqueOrThrow({ where: { id: a.id } })).categoryId).toBe(to.id)
    })

    it('archive: soft delete (kept for order history), unfeatured; archiving again → "not found"', async () => {
      const c = await makeCategory()
      const p = await makeProduct({ categoryId: c.id, isFeatured: true })
      expect((await bulk('archive', [p.id]).expect(200)).body.data.succeeded).toEqual([p.id])
      expect(await db.product.findUniqueOrThrow({ where: { id: p.id } })).toMatchObject({
        status: 'ARCHIVED',
        isFeatured: false,
        deletedAt: expect.any(Date),
      })
      const again = await bulk('archive', [p.id]).expect(200)
      expect(again.body.data.failed[0].reason).toMatch(/Not found/)
    })

    it('an unknown id fails on its own (name null)', async () => {
      const c = await makeCategory()
      const p = await makeProduct({ categoryId: c.id, status: 'DRAFT' })
      const ghost = '00000000-0000-4000-8000-000000000000'
      const res = await bulk('publish', [p.id, ghost]).expect(200)
      expect(res.body.data.succeeded).toEqual([p.id])
      expect(res.body.data.failed).toEqual([{ id: ghost, name: null, reason: expect.any(String) }])
    })

    it('validates the request: known action, 1–100 distinct ids', async () => {
      const id = '00000000-0000-4000-8000-000000000000'
      await bulk('delete-everything', [id]).expect(400)
      await bulk('publish', []).expect(400)
      await bulk('publish', [id, id]).expect(400)
      await bulk('publish', ['not-a-uuid']).expect(400)
      const many = Array.from(
        { length: 101 },
        (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
      )
      await bulk('publish', many).expect(400)
    })
  })

  it('admin-only: without an admin sign-in → 401', async () => {
    const outsider = await createTestApp({ asAdmin: false })
    try {
      await request(outsider.getHttpServer()).get('/api/v1/admin/products').expect(401)
      await request(outsider.getHttpServer())
        .get('/api/v1/admin/products/00000000-0000-4000-8000-000000000000')
        .expect(401)
      await request(outsider.getHttpServer())
        .post('/api/v1/admin/products/bulk')
        .send({ action: 'archive', ids: ['00000000-0000-4000-8000-000000000000'] })
        .expect(401)
    } finally {
      await outsider.close()
    }
  })
})
