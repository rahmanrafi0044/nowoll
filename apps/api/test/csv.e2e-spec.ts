// HTTP tests for GET /products/export and POST /products/import (real nowoll_test DB).
import type { NestExpressApplication } from '@nestjs/platform-express'
import { parse } from 'csv-parse/sync'
import request from 'supertest'
import { createTestApp } from './utils/app.js'
import { makeCategory, makeProduct } from './utils/factories.js'
import { resetDatabase, testPrisma } from './utils/test-db.js'

const db = testPrisma()
afterAll(() => db.$disconnect())

/** Builds a CSV file from a header and rows (arrays of cells). */
function csv(header: string[], ...rows: string[][]): Buffer {
  const quote = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
  return Buffer.from([header, ...rows].map((r) => r.map(quote).join(',')).join('\n'))
}

describe('products CSV — as admin', () => {
  let app: NestExpressApplication
  const http = () => request(app.getHttpServer())
  const exportCsv = () =>
    http()
      .get('/api/v1/products/export')
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => chunks.push(c))
        res.on('end', () => cb(null, Buffer.concat(chunks)))
      })
  const importCsv = (file: Buffer, dryRun = false) =>
    http()
      .post(`/api/v1/products/import${dryRun ? '?dryRun=true' : ''}`)
      .attach('file', file, 'products.csv')

  beforeAll(async () => {
    app = await createTestApp({ asAdmin: true })
  })
  afterAll(() => app.close())
  beforeEach(() => resetDatabase())

  // ── Export ──

  it('exports one row per variant, with a BOM for Excel and a download filename', async () => {
    const c = await makeCategory({ name: 'Men' })
    await makeProduct({
      categoryId: c.id,
      name: 'Oxford',
      basePrice: '1499.5',
      tags: ['formal', 'office'],
      variants: [
        { size: 'M', color: 'Blue', stock: 3 },
        { size: 'L', color: 'Blue', stock: 0, price: '1599' },
      ],
    })
    await makeProduct({ categoryId: c.id, name: 'No variants', status: 'DRAFT', variants: [] })
    await makeProduct({ categoryId: c.id, name: 'Archived', status: 'ARCHIVED' }).then((p) =>
      db.product.update({ where: { id: p.id }, data: { deletedAt: new Date() } }),
    )

    const res = await exportCsv().expect(200)
    expect(res.headers['content-type']).toBe('text/csv; charset=utf-8')
    expect(res.headers['content-disposition']).toMatch(
      /attachment; filename="nowoll-products-\d{4}-\d{2}-\d{2}\.csv"/,
    )
    const body = res.body as Buffer
    expect(body.subarray(0, 3)).toEqual(Buffer.from([0xef, 0xbb, 0xbf])) // UTF-8 BOM

    const rows = parse(body, { bom: true, columns: true }) as Record<string, string>[]
    expect(rows.map((r) => [r.product_name, r.size, r.variant_price, r.stock])).toEqual([
      ['Oxford', 'M', '', '3'],
      ['Oxford', 'L', '1599.00', '0'],
      ['No variants', '', '', ''],
    ])
    expect(rows[0]).toMatchObject({
      base_price: '1499.50',
      tags: 'formal|office',
      status: 'ACTIVE',
    })
  })

  it('neutralises spreadsheet formulas (CSV injection)', async () => {
    const c = await makeCategory()
    const p = await makeProduct({
      categoryId: c.id,
      description: '=HYPERLINK("http://evil.example","click")',
    })
    const res = await exportCsv().expect(200)
    const rows = parse(res.body as Buffer, { bom: true, columns: true }) as Record<string, string>[]
    expect(rows[0]!.description).toBe(`'=HYPERLINK("http://evil.example","click")`)

    // …and importing the file back restores the original text exactly
    await importCsv(res.body as Buffer).expect(201)
    expect((await db.product.findUniqueOrThrow({ where: { id: p.id } })).description).toBe(
      '=HYPERLINK("http://evil.example","click")',
    )
  })

  // ── Round trip ──

  it('re-importing an unmodified export changes nothing', async () => {
    const c = await makeCategory()
    await makeProduct({
      categoryId: c.id,
      compareAtPrice: '1500',
      variants: [{ size: 'M', color: 'Red', stock: 4 }],
    })
    await makeProduct({ categoryId: c.id, status: 'DRAFT', variants: [] })
    const before = await db.product.findMany({
      orderBy: { slug: 'asc' },
      include: { variants: true },
    })

    const exported = (await exportCsv()).body as Buffer
    const res = await importCsv(exported).expect(201)
    expect(res.body.data).toEqual({
      dryRun: false,
      products: { created: 0, updated: 0, unchanged: 2 },
      variants: { created: 0, updated: 0, unchanged: 1 },
      stockChanges: 0,
    })
    const after = await db.product.findMany({
      orderBy: { slug: 'asc' },
      include: { variants: true },
    })
    expect(after.map((p) => p.updatedAt)).toEqual(before.map((p) => p.updatedAt))
    expect(await db.inventoryLog.count()).toBe(0)
  })

  // ── Create ──

  it('creates new products and variants as DRAFT, logging starting stock as CSV_IMPORT', async () => {
    await makeCategory({ name: 'Tees' }).then((c) =>
      db.category.update({ where: { id: c.id }, data: { slug: 'tees' } }),
    )
    const file = csv(
      [
        'product_slug',
        'product_name',
        'category_slug',
        'base_price',
        'tags',
        'sku',
        'size',
        'color',
        'stock',
      ],
      ['basic-tee', 'Basic Tee', 'tees', '599', 'cotton|basics', 'TEE-S', 'S', 'White', '10'],
      ['basic-tee', 'Basic Tee', 'tees', '599', 'cotton|basics', 'TEE-M', 'M', 'White', '0'],
    )
    const res = await importCsv(file).expect(201)
    expect(res.body.data).toMatchObject({ products: { created: 1 }, variants: { created: 2 } })

    const p = await db.product.findUniqueOrThrow({
      where: { slug: 'basic-tee' },
      include: { variants: { orderBy: { sortOrder: 'asc' } } },
    })
    expect(p).toMatchObject({ status: 'DRAFT', tags: ['cotton', 'basics'] })
    expect(p.variants.map((v) => [v.sku, v.stock, v.sortOrder])).toEqual([
      ['TEE-S', 10, 0],
      ['TEE-M', 0, 1],
    ])
    expect(await db.inventoryLog.findMany()).toEqual([
      expect.objectContaining({ change: 10, stockAfter: 10, reason: 'CSV_IMPORT' }),
    ])
  })

  // ── Update ──

  it('a stock-only file updates stock, logs the exact change and touches nothing else', async () => {
    const c = await makeCategory()
    const p = await makeProduct({
      categoryId: c.id,
      description: 'Keep me',
      variants: [{ size: 'M', color: 'Red', stock: 4 }],
    })
    const sku = p.variants[0]!.sku

    const res = await importCsv(csv(['product_slug', 'sku', 'stock'], [p.slug, sku, '9'])).expect(
      201,
    )
    expect(res.body.data).toMatchObject({
      variants: { updated: 1 },
      stockChanges: 1,
      products: { unchanged: 1 },
    })

    const v = await db.productVariant.findUniqueOrThrow({ where: { sku } })
    expect(v.stock).toBe(9)
    expect((await db.product.findUniqueOrThrow({ where: { id: p.id } })).description).toBe(
      'Keep me',
    )
    expect(await db.inventoryLog.findMany()).toEqual([
      expect.objectContaining({ change: 5, stockAfter: 9, reason: 'CSV_IMPORT' }),
    ])
  })

  it('a blank optional cell clears the field; a blank required cell leaves it alone', async () => {
    const c = await makeCategory()
    const p = await makeProduct({
      categoryId: c.id,
      name: 'Named',
      description: 'Old text',
      compareAtPrice: '2000',
    })
    await importCsv(
      csv(
        ['product_slug', 'product_name', 'description', 'compare_at_price'],
        [p.slug, '', '', ''],
      ),
    ).expect(201)
    const after = await db.product.findUniqueOrThrow({ where: { id: p.id } })
    expect(after).toMatchObject({ name: 'Named', description: null, compareAtPrice: null })
  })

  it('restores an archived variant when its SKU is imported again', async () => {
    const c = await makeCategory()
    const p = await makeProduct({
      categoryId: c.id,
      status: 'DRAFT',
      variants: [{ size: 'M', color: 'Red' }],
    })
    const sku = p.variants[0]!.sku
    await db.productVariant.update({
      where: { sku },
      data: { deletedAt: new Date(), isActive: false },
    })

    await importCsv(csv(['product_slug', 'sku', 'variant_active'], [p.slug, sku, 'true'])).expect(
      201,
    )
    expect(await db.productVariant.findUniqueOrThrow({ where: { sku } })).toMatchObject({
      deletedAt: null,
      isActive: true,
    })
  })

  // ── Dry run ──

  it('dry run reports the changes without saving anything', async () => {
    await makeCategory().then((c) =>
      db.category.update({ where: { id: c.id }, data: { slug: 'tees' } }),
    )
    const res = await importCsv(
      csv(
        [
          'product_slug',
          'product_name',
          'category_slug',
          'base_price',
          'sku',
          'size',
          'color',
          'stock',
        ],
        ['new-tee', 'New', 'tees', '500', 'N-1', 'M', 'Red', '3'],
      ),
      true,
    ).expect(201)
    expect(res.body.data).toMatchObject({
      dryRun: true,
      products: { created: 1 },
      variants: { created: 1 },
      stockChanges: 1,
    })
    expect(await db.product.count()).toBe(0)
  })

  // ── All-or-nothing ──

  it('rejects the whole file if any row is bad, listing every problem by row number', async () => {
    await makeCategory().then((c) =>
      db.category.update({ where: { id: c.id }, data: { slug: 'tees' } }),
    )
    const res = await importCsv(
      csv(
        [
          'product_slug',
          'product_name',
          'category_slug',
          'base_price',
          'sku',
          'size',
          'color',
          'stock',
        ],
        ['good-tee', 'Good', 'tees', '500', 'G-1', 'M', 'Red', '3'],
        ['bad-tee', 'Bad', 'no-such-category', '12.345', 'B-1', 'M', 'Red', '-2'],
      ),
    ).expect(400)

    expect(res.body).toMatchObject({
      success: false,
      message: expect.stringMatching(/3 problems found\. Nothing was saved/),
    })
    expect(res.body.details).toEqual([
      'Row 3, category_slug: no category "no-such-category"',
      'Row 3, base_price: "12.345" is not a valid amount (use e.g. 1499 or 1499.50)',
      'Row 3, stock: "-2" is not a whole number',
    ])
    expect(await db.product.count()).toBe(0) // the good row was NOT saved either
  })

  it('saves nothing even when the bad value is one the save step would simply skip', async () => {
    // A negative stock fails validation, but if it slipped through, the variant
    // would just be created with stock 0 and the save would SUCCEED. So this
    // proves the validation step alone blocks the import — not a lucky crash.
    await makeCategory().then((c) =>
      db.category.update({ where: { id: c.id }, data: { slug: 'tees' } }),
    )
    const res = await importCsv(
      csv(
        [
          'product_slug',
          'product_name',
          'category_slug',
          'base_price',
          'sku',
          'size',
          'color',
          'stock',
        ],
        ['good-tee', 'Good', 'tees', '500', 'G-1', 'M', 'Red', '3'],
        ['good-tee', 'Good', 'tees', '500', 'G-2', 'L', 'Red', '-2'],
      ),
    ).expect(400)
    expect(res.body.details).toEqual(['Row 3, stock: "-2" is not a whole number'])
    expect(await db.product.count()).toBe(0)
    expect(await db.productVariant.count()).toBe(0)
  })

  it.each([
    [
      'archived product slug',
      async () => {
        const c = await makeCategory()
        const p = await makeProduct({ categoryId: c.id })
        await db.product.update({
          where: { id: p.id },
          data: { deletedAt: new Date(), status: 'ARCHIVED' },
        })
        return csv(['product_slug', 'product_name'], [p.slug, 'X'])
      },
      /archived product/,
    ],
    [
      'SKU owned by another product',
      async () => {
        const c = await makeCategory()
        const a = await makeProduct({ categoryId: c.id })
        const b = await makeProduct({ categoryId: c.id })
        return csv(
          ['product_slug', 'sku', 'size', 'color'],
          [b.slug, a.variants[0]!.sku, 'XL', 'Red'],
        )
      },
      /already belongs to another product/,
    ],
    [
      'duplicate SKU in the file',
      async () => {
        const c = await makeCategory()
        const p = await makeProduct({ categoryId: c.id, status: 'DRAFT', variants: [] })
        return csv(
          ['product_slug', 'sku', 'size', 'color'],
          [p.slug, 'X-1', 'M', 'Red'],
          [p.slug, 'X-1', 'L', 'Red'],
        )
      },
      /appears more than once \(also row 2\)/,
    ],
    [
      'same size/color twice',
      async () => {
        const c = await makeCategory()
        const p = await makeProduct({
          categoryId: c.id,
          status: 'DRAFT',
          variants: [{ size: 'M', color: 'Red' }],
        })
        return csv(['product_slug', 'sku', 'size', 'color'], [p.slug, 'NEW-1', 'm', 'RED'])
      },
      /already has a m \/ RED variant/,
    ],
    [
      'product columns that differ between rows',
      async () => {
        const c = await makeCategory()
        const p = await makeProduct({ categoryId: c.id, status: 'DRAFT', variants: [] })
        return csv(
          ['product_slug', 'product_name', 'sku', 'size', 'color'],
          [p.slug, 'One', 'A', 'M', 'Red'],
          [p.slug, 'Two', 'B', 'L', 'Red'],
        )
      },
      /Row 3, product_name: must match row 2/,
    ],
    [
      'publishing a product that has no image',
      async () => {
        const c = await makeCategory()
        const p = await makeProduct({ categoryId: c.id, status: 'DRAFT', withImage: false })
        return csv(['product_slug', 'status'], [p.slug, 'ACTIVE'])
      },
      /can't be ACTIVE: it needs an image/,
    ],
    [
      'compare-at price not above the price',
      async () => {
        const c = await makeCategory()
        const p = await makeProduct({ categoryId: c.id, basePrice: '1000' })
        return csv(['product_slug', 'compare_at_price'], [p.slug, '900'])
      },
      /must be higher than base_price/,
    ],
    [
      'new product missing required columns',
      async () => csv(['product_slug', 'product_name'], ['brand-new', 'Brand New']),
      /category_slug: is required for a new product/,
    ],
  ])('rejects: %s', async (_label, build, expected) => {
    const file = await build()
    const res = await importCsv(file).expect(400)
    expect(res.body.details.join('\n')).toMatch(expected)
  })

  it.each([
    [
      'unknown column (typo)',
      csv(['product_slug', 'prodcut_name'], ['a', 'b']),
      /columns Nowoll does not recognise/,
    ],
    ['no product_slug column', csv(['product_name'], ['a']), /must have a product_slug column/],
    ['broken quotes', Buffer.from('product_slug,product_name\na,"unclosed\n'), /could not be read/],
    ['binary file', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x00]), /not a CSV text file/],
    ['header only', Buffer.from('product_slug,product_name\n'), /no rows/],
  ])('rejects malformed files: %s', async (_label, file, expected) => {
    const res = await importCsv(file).expect(400)
    expect(res.body.message).toMatch(expected)
  })

  it('accepts files saved by Excel (BOM, Windows line endings, uppercase headers)', async () => {
    const c = await makeCategory()
    const p = await makeProduct({
      categoryId: c.id,
      variants: [{ size: 'M', color: 'Red', stock: 1 }],
    })
    const file = Buffer.from(
      `\uFEFFProduct_Slug,SKU,Stock\r\n${p.slug},${p.variants[0]!.sku},7\r\n`,
    )
    await importCsv(file).expect(201)
    expect(
      (await db.productVariant.findUniqueOrThrow({ where: { id: p.variants[0]!.id } })).stock,
    ).toBe(7)
  })

  it('caps the import at 5000 rows', async () => {
    const rows = Array.from({ length: 5001 }, (_, i) => [`p-${i}`, 'X'])
    const res = await importCsv(csv(['product_slug', 'product_name'], ...rows)).expect(400)
    expect(res.body.message).toMatch(/At most 5000 rows/)
  })
})

describe('products CSV — without admin access', () => {
  let app: NestExpressApplication
  beforeAll(async () => {
    app = await createTestApp({ asAdmin: false })
  })
  afterAll(() => app.close())

  it('refuses export and import with 401', async () => {
    await request(app.getHttpServer()).get('/api/v1/products/export').expect(401)
    await request(app.getHttpServer())
      .post('/api/v1/products/import')
      .attach('file', Buffer.from('product_slug\nx\n'), 'a.csv')
      .expect(401)
  })
})
