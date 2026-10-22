// HTTP-level tests for /api/v1/products and /api/v1/variants (real nowoll_test database).
import type { NestExpressApplication } from '@nestjs/platform-express'
import request from 'supertest'
import { createTestApp } from './utils/app.js'
import { makeCategory, makeProduct } from './utils/factories.js'
import { resetDatabase, testPrisma } from './utils/test-db.js'

afterAll(() => testPrisma().$disconnect())

describe('products API — as admin', () => {
  let app: NestExpressApplication
  const http = () => request(app.getHttpServer())

  beforeAll(async () => {
    app = await createTestApp({ asAdmin: true })
  })
  afterAll(() => app.close())
  beforeEach(() => resetDatabase())

  it('lifecycle: create draft → hidden → add image → publish → listed → archive', async () => {
    const category = await makeCategory({ name: 'Men' })

    const created = await http()
      .post('/api/v1/products')
      .send({
        name: 'Oxford Shirt',
        categoryId: category.id,
        basePrice: 1499.5,
        tags: [' Formal ', 'formal', 'Office'],
        variants: [
          { sku: 'OXF-M-BLU', size: 'M', color: 'Blue', colorHex: '#1E3A8A', stock: 3 },
          { sku: 'OXF-L-BLU', size: 'L', color: 'Blue', price: 1599 },
        ],
      })
      .expect(201)
    const product = created.body.data
    expect(product).toMatchObject({
      slug: 'oxford-shirt',
      status: 'DRAFT',
      tags: ['formal', 'office'],
    })
    // Money travels as an exact string, never a float
    expect(product.basePrice).toBe('1499.5')

    // Drafts are invisible to customers
    expect((await http().get('/api/v1/products').expect(200)).body.data.total).toBe(0)
    expect((await http().get('/api/v1/products/oxford-shirt').expect(200)).body.data).toBeNull()

    // Can't publish without an image (image upload arrives in the next commit)
    const blocked = await http()
      .patch(`/api/v1/products/${product.id}`)
      .send({ status: 'ACTIVE' })
      .expect(409)
    expect(blocked.body.message).toMatch(/needs an image/)
    await testPrisma().productImage.create({
      data: {
        productId: product.id,
        url: 'https://x.supabase.co/a.jpg',
        storagePath: 'a.jpg',
        altText: 'Front',
      },
    })
    await http().patch(`/api/v1/products/${product.id}`).send({ status: 'ACTIVE' }).expect(200)

    const listed = await http().get('/api/v1/products?q=shirts').expect(200)
    expect(listed.body.data).toMatchObject({ total: 1, page: 1, totalPages: 1 })
    expect(listed.body.data.items[0]).toMatchObject({
      slug: 'oxford-shirt',
      inStock: true,
      sizes: ['M', 'L'],
    })

    const detail = await http().get('/api/v1/products/oxford-shirt').expect(200)
    expect(detail.body.data.variants.map((v: { price: string }) => v.price)).toEqual([
      '1499.5',
      '1599',
    ])

    await http().delete(`/api/v1/products/${product.id}`).expect(200)
    expect((await http().get('/api/v1/products/oxford-shirt').expect(200)).body.data).toBeNull()
  })

  it('manages variants through /variants', async () => {
    const category = await makeCategory()
    const p = await makeProduct({
      categoryId: category.id,
      variants: [{ size: 'M', color: 'Black' }],
    })

    const added = await http()
      .post(`/api/v1/variants/product/${p.id}`)
      .send({ sku: 'NEW-L', size: 'L', color: 'Black', stock: 2 })
      .expect(201)
    await http()
      .patch(`/api/v1/variants/${added.body.data.id}`)
      .send({ colorHex: '#111111' })
      .expect(200)

    const listed = await http().get(`/api/v1/variants/product/${p.id}`).expect(200)
    expect(listed.body.data.map((v: { size: string }) => v.size)).toEqual(['M', 'L'])

    await http().delete(`/api/v1/variants/${added.body.data.id}`).expect(200)
  })

  it('refuses to change stock through PATCH /variants (stock changes must be logged)', async () => {
    const category = await makeCategory()
    const p = await makeProduct({ categoryId: category.id })
    const res = await http()
      .patch(`/api/v1/variants/${p.variants[0]!.id}`)
      .send({ stock: 999 })
      .expect(400)
    expect(res.body.message).toContain('property stock should not exist')
  })

  it.each([
    ['missing price', { name: 'X' }],
    ['3-decimal price', { name: 'X', basePrice: 10.005 }],
    ['negative price', { name: 'X', basePrice: -5 }],
    ['price as text', { name: 'X', basePrice: '1499' }],
    ['status on create', { name: 'X', basePrice: 10, status: 'ACTIVE' }],
    [
      'bad variant sku',
      { name: 'X', basePrice: 10, variants: [{ sku: 'has space', size: 'M', color: 'Red' }] },
    ],
    [
      'bad colorHex',
      {
        name: 'X',
        basePrice: 10,
        variants: [{ sku: 'A', size: 'M', color: 'Red', colorHex: 'red' }],
      },
    ],
    [
      'too many tags',
      { name: 'X', basePrice: 10, tags: Array.from({ length: 21 }, (_, i) => `t${i}`) },
    ],
  ])('rejects invalid product input: %s', async (_label, body) => {
    const category = await makeCategory()
    const res = await http()
      .post('/api/v1/products')
      .send({ categoryId: category.id, ...body })
      .expect(400)
    expect(res.body.success).toBe(false)
  })

  it.each([
    ['pageSize too big', 'pageSize=500'],
    ['page 0', 'page=0'],
    ['unknown sort', 'sort=cheapest'],
    ['unknown filter', 'colour=red'],
    ['non-numeric price', 'minPrice=cheap'],
  ])('rejects invalid list query: %s', async (_label, qs) => {
    await http().get(`/api/v1/products?${qs}`).expect(400)
  })

  it('parses query-string numbers and booleans', async () => {
    const category = await makeCategory()
    await makeProduct({ categoryId: category.id, basePrice: '800', isFeatured: true })
    const res = await http()
      .get('/api/v1/products?featured=true&maxPrice=1000&page=1&pageSize=12')
      .expect(200)
    expect(res.body.data).toMatchObject({ total: 1, pageSize: 12 })
  })
})

describe('products API — without admin access', () => {
  let app: NestExpressApplication
  const http = () => request(app.getHttpServer())

  beforeAll(async () => {
    app = await createTestApp({ asAdmin: false })
  })
  afterAll(() => app.close())
  beforeEach(() => resetDatabase())

  it('lets anyone browse', async () => {
    await http().get('/api/v1/products').expect(200)
  })

  it.each([
    ['POST', '/api/v1/products'],
    ['PATCH', '/api/v1/products/00000000-0000-0000-0000-000000000000'],
    ['DELETE', '/api/v1/products/00000000-0000-0000-0000-000000000000'],
    ['POST', '/api/v1/variants/product/00000000-0000-0000-0000-000000000000'],
    ['PATCH', '/api/v1/variants/00000000-0000-0000-0000-000000000000'],
    ['DELETE', '/api/v1/variants/00000000-0000-0000-0000-000000000000'],
  ])('refuses %s %s with 401', async (method, url) => {
    const agent = http()
    const req =
      method === 'POST'
        ? agent.post(url)
        : method === 'PATCH'
          ? agent.patch(url)
          : agent.delete(url)
    await req.send({}).expect(401)
  })
})

describe('GET /products/facets', () => {
  let app: NestExpressApplication
  beforeAll(async () => {
    app = await createTestApp({ asAdmin: false })
  })
  afterAll(() => app.close())
  beforeEach(() => resetDatabase())

  it('is public, routes before /:slug, and serializes prices as strings', async () => {
    const c = await makeCategory()
    await makeProduct({
      categoryId: c.id,
      basePrice: '1499.5',
      variants: [{ size: 'M', color: 'Blue' }],
    })
    const res = await request(app.getHttpServer())
      .get(`/api/v1/products/facets?category=${c.slug}`)
      .expect(200)
    expect(res.body.data).toEqual({
      sizes: ['M'],
      colors: [{ color: 'Blue', colorHex: null }],
      price: { min: '1499.5', max: '1499.5' },
      counts: { sizes: { M: 1 }, colors: { Blue: 1 } },
      fabrics: [],
    })
  })

  it('38f: counts PRODUCTS per size/colour and lists fabrics; the list filters by fabric', async () => {
    const c = await makeCategory()
    // M in two colours is still ONE product with an M.
    await makeProduct({
      categoryId: c.id,
      fabric: 'Lawn',
      variants: [
        { size: 'M', color: 'Blue' },
        { size: 'M', color: 'Red' },
        { size: 'L', color: 'Blue' },
      ],
    })
    await makeProduct({
      categoryId: c.id,
      fabric: 'Lawn',
      variants: [{ size: 'M', color: 'Blue' }],
    })
    await makeProduct({
      categoryId: c.id,
      fabric: 'Chiffon',
      variants: [{ size: 'S', color: 'Red' }],
    })
    // Not counted: a draft, and a size that is switched off.
    await makeProduct({ categoryId: c.id, fabric: 'Silk', status: 'DRAFT' })
    await makeProduct({
      categoryId: c.id,
      variants: [
        { size: 'XL', color: 'Green', isActive: false },
        { size: 'S', color: 'Green' },
      ],
    })

    const res = await request(app.getHttpServer())
      .get(`/api/v1/products/facets?category=${c.slug}`)
      .expect(200)
    expect(res.body.data.counts).toEqual({
      sizes: { M: 2, L: 1, S: 2 },
      colors: { Blue: 2, Red: 2, Green: 1 },
    })
    expect(res.body.data.fabrics).toEqual([
      { fabric: 'Chiffon', count: 1 },
      { fabric: 'Lawn', count: 2 },
    ])

    const lawn = await request(app.getHttpServer())
      .get(`/api/v1/products?category=${c.slug}&fabric=lawn`)
      .expect(200)
    expect(lawn.body.data.total).toBe(2)
    expect(lawn.body.data.items.every((p: { fabric: string }) => p.fabric === 'Lawn')).toBe(true)
  })

  it('38f: fabrics typed in different case count as ONE choice, with the usual spelling', async () => {
    const c = await makeCategory()
    for (const fabric of ['Lawn', 'Lawn', 'lawn ']) await makeProduct({ categoryId: c.id, fabric })
    const res = await request(app.getHttpServer())
      .get(`/api/v1/products/facets?category=${c.slug}`)
      .expect(200)
    expect(res.body.data.fabrics).toEqual([{ fabric: 'Lawn', count: 3 }])
  })

  it('rejects unknown query parameters', async () => {
    await request(app.getHttpServer()).get('/api/v1/products/facets?size=M').expect(400)
  })
})
