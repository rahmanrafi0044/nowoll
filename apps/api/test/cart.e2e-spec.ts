// HTTP tests for POST /api/v1/cart/price (real nowoll_test database).
import type { NestExpressApplication } from '@nestjs/platform-express'
import request from 'supertest'
import { createTestApp } from './utils/app.js'
import { makeCategory, makeProduct } from './utils/factories.js'
import { resetDatabase, testPrisma } from './utils/test-db.js'

const db = testPrisma()
afterAll(() => db.$disconnect())

describe('POST /cart/price', () => {
  let app: NestExpressApplication
  const price = (items: object[]) =>
    request(app.getHttpServer()).post('/api/v1/cart/price').send({ items })

  beforeAll(async () => {
    app = await createTestApp({ asAdmin: false })
  })
  afterAll(() => app.close())
  beforeEach(() => resetDatabase())

  it("prices each line at TODAY's database price, with its photo", async () => {
    const c = await makeCategory()
    const p = await makeProduct({
      categoryId: c.id,
      name: 'Oxford Shirt',
      basePrice: '1490',
      variants: [
        { size: 'M', color: 'Blue', stock: 5 },
        { size: 'XL', color: 'Blue', stock: 5, price: '1590' },
      ],
    })
    const res = await price([
      { variantId: p.variants[0]!.id, quantity: 2 },
      { variantId: p.variants[1]!.id, quantity: 1 },
    ]).expect(200)

    expect(res.body.data).toMatchObject({ subtotal: '4570', canCheckout: true })
    expect(res.body.data.lines[0]).toMatchObject({
      status: 'ok',
      productName: 'Oxford Shirt',
      variantLabel: 'M / Blue',
      unitPrice: '1490',
      lineTotal: '2980',
      imageUrl: expect.stringContaining('oxford-shirt'),
    })
    expect(res.body.data.lines[1]).toMatchObject({ unitPrice: '1590' })
  })

  it('marks unavailable lines instead of failing the whole bag', async () => {
    const c = await makeCategory()
    const p = await makeProduct({
      categoryId: c.id,
      variants: [
        { size: 'M', color: 'Blue' },
        { size: 'L', color: 'Blue' },
      ],
    })
    await db.productVariant.update({ where: { id: p.variants[1]!.id }, data: { isActive: false } })

    const res = await price([
      { variantId: p.variants[0]!.id, quantity: 1 },
      { variantId: p.variants[1]!.id, quantity: 1 },
      { variantId: '00000000-0000-0000-0000-000000000000', quantity: 1 },
    ]).expect(200)
    expect(res.body.data.lines.map((l: { status: string }) => l.status)).toEqual([
      'ok',
      'unavailable',
      'unavailable',
    ])
    expect(res.body.data.canCheckout).toBe(false)
    expect(res.body.data.lines[1]).not.toHaveProperty('unitPrice')
  })

  it('says when there is not enough stock, without revealing the count', async () => {
    const c = await makeCategory()
    const p = await makeProduct({
      categoryId: c.id,
      variants: [{ size: 'M', color: 'Blue', stock: 2 }],
    })
    const res = await price([{ variantId: p.variants[0]!.id, quantity: 3 }]).expect(200)
    expect(res.body.data.lines[0].status).toBe('insufficient_stock')
    expect(JSON.stringify(res.body)).not.toMatch(/"stock"/)
    expect(res.body.data.canCheckout).toBe(false)
  })

  it('treats a draft or archived product as unavailable', async () => {
    const c = await makeCategory()
    const draft = await makeProduct({ categoryId: c.id, status: 'DRAFT' })
    const res = await price([{ variantId: draft.variants[0]!.id, quantity: 1 }]).expect(200)
    expect(res.body.data.lines[0].status).toBe('unavailable')
  })

  it('merges duplicate lines and accepts an empty bag', async () => {
    const c = await makeCategory()
    const p = await makeProduct({ categoryId: c.id, basePrice: '100' })
    const id = p.variants[0]!.id
    const res = await price([
      { variantId: id, quantity: 1 },
      { variantId: id, quantity: 2 },
    ]).expect(200)
    expect(res.body.data.lines).toHaveLength(1)
    expect(res.body.data.lines[0]).toMatchObject({ quantity: 3, lineTotal: '300' })
    expect((await price([]).expect(200)).body.data).toEqual({
      lines: [],
      subtotal: '0',
      canCheckout: true,
    })
  })

  it.each([
    [
      'a price sent by the browser',
      [{ variantId: '00000000-0000-0000-0000-000000000000', quantity: 1, unitPrice: 1 }],
    ],
    ['quantity 0', [{ variantId: '00000000-0000-0000-0000-000000000000', quantity: 0 }]],
    ['a bad id', [{ variantId: 'abc', quantity: 1 }]],
  ])('rejects %s', async (_label, items) => {
    await price(items).expect(400)
  })
})
