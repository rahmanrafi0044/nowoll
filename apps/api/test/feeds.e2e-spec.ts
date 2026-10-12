// Step 39c — the Meta catalogue feed: GET /api/v1/feeds/meta-catalog.csv (public,
// off by default) and its report for Admin → Marketing.
import type { NestExpressApplication } from '@nestjs/platform-express'
import { parse } from 'csv-parse/sync'
import request from 'supertest'
import { createTestApp } from './utils/app.js'
import { makeCategory, makeProduct } from './utils/factories.js'
import { resetDatabase, testPrisma } from './utils/test-db.js'

const db = testPrisma()
afterAll(() => db.$disconnect())

describe('Meta catalogue feed', () => {
  let app: NestExpressApplication
  const http = () => request(app.getHttpServer())
  const switchOn = () =>
    http()
      .patch('/api/v1/admin/settings')
      .send({ values: { meta_catalog_enabled: true } })
      .expect(200)
  const rowsOf = (text: string) =>
    parse(text, { columns: true, skip_empty_lines: true }) as Record<string, string>[]

  beforeEach(async () => {
    await resetDatabase()
    app = await createTestApp({ asAdmin: true })
  })
  afterEach(() => app.close())

  it('off by default → 404 (nothing for anyone to read)', async () => {
    await http().get('/api/v1/feeds/meta-catalog.csv').expect(404)
  })

  it('on → CSV with one row per size/colour of what the shop shows, Meta’s columns', async () => {
    const men = await makeCategory({ name: 'Men' })
    const shirts = await makeCategory({ name: 'Shirts', parentId: men.id })
    const shirt = await makeProduct({
      categoryId: shirts.id,
      name: 'Oxford Shirt',
      basePrice: '1490',
      compareAtPrice: '1990',
      description: 'Breathable **cotton**.',
      variants: [
        { size: 'M', color: 'Blue', stock: 2 },
        { size: 'L', color: 'Blue', stock: 0 },
        { size: 'XL', color: 'Blue', isActive: false }, // not on sale → not listed
      ],
    })
    // Not shown in the shop → not in the feed:
    await makeProduct({ categoryId: shirts.id, name: 'Draft', status: 'DRAFT' })
    const hidden = await makeCategory({ name: 'Hidden', isActive: false })
    await makeProduct({ categoryId: hidden.id, name: 'In hidden category' })
    const gone = await makeProduct({ categoryId: shirts.id, name: 'Deleted' })
    await db.product.update({ where: { id: gone.id }, data: { deletedAt: new Date() } })

    await switchOn()
    const res = await http().get('/api/v1/feeds/meta-catalog.csv').expect(200)
    expect(res.headers['content-type']).toBe('text/csv; charset=utf-8')
    expect(res.headers['cache-control']).toBe('public, max-age=3600')
    expect(res.text.split('\n')[0]).toBe(
      'id,item_group_id,title,description,availability,condition,price,sale_price,link,image_link,additional_image_link,brand,size,color,product_type,status',
    )
    const rows = rowsOf(res.text)
    expect(rows).toEqual([
      expect.objectContaining({
        id: shirt.variants[0]!.sku,
        item_group_id: shirt.id,
        title: 'Oxford Shirt',
        description: 'Breathable cotton.',
        availability: 'in stock',
        condition: 'new',
        price: '1990.00 BDT',
        sale_price: '1490.00 BDT',
        link: expect.stringMatching(new RegExp(`/products/${shirt.slug}$`)),
        image_link: shirt.images[0]!.url,
        brand: 'Nowoll',
        size: 'M',
        color: 'Blue',
        product_type: 'Men > Shirts',
        status: 'active',
      }),
      expect.objectContaining({ id: shirt.variants[1]!.sku, availability: 'out of stock' }),
    ])
  })

  it('admin report: on/off, the address, items, and which products were left out and why', async () => {
    const c = await makeCategory()
    await makeProduct({ categoryId: c.id, name: 'Good' })
    await makeProduct({ categoryId: c.id, name: 'No photo', withImage: false })
    const r = (await http().get('/api/v1/admin/feeds/meta-catalog').expect(200)).body.data
    expect(r).toMatchObject({
      enabled: false,
      url: expect.stringMatching(/\/api\/v1\/feeds\/meta-catalog\.csv$/),
      items: 1,
      skipped: [expect.objectContaining({ name: 'No photo', reason: 'No photo' })],
    })
  })

  it('the store name is the brand; changes show after the cache (report is always fresh)', async () => {
    const c = await makeCategory()
    await makeProduct({ categoryId: c.id })
    await http()
      .patch('/api/v1/admin/settings')
      .send({ values: { store_name: 'Nowoll BD', meta_catalog_enabled: true } })
      .expect(200)
    await http().get('/api/v1/admin/feeds/meta-catalog').expect(200) // rebuilds now
    const rows = rowsOf((await http().get('/api/v1/feeds/meta-catalog.csv').expect(200)).text)
    expect(rows[0]).toMatchObject({ brand: 'Nowoll BD' })
  })

  it('the feed is public; its report is Admin only', async () => {
    const outsider = await createTestApp({ asAdmin: false })
    const staff = await createTestApp({ asAdmin: true, role: 'STAFF' })
    try {
      await switchOn()
      await request(outsider.getHttpServer()).get('/api/v1/feeds/meta-catalog.csv').expect(200)
      await request(outsider.getHttpServer()).get('/api/v1/admin/feeds/meta-catalog').expect(401)
      await request(staff.getHttpServer()).get('/api/v1/admin/feeds/meta-catalog').expect(403)
    } finally {
      await outsider.close()
      await staff.close()
    }
  })
})
