// HTTP tests for /api/v1/inventory (real nowoll_test database).
import type { NestExpressApplication } from '@nestjs/platform-express'
import request from 'supertest'
import { LOW_STOCK_ALERTER } from '../src/inventory/low-stock-alerter.js'
import { createTestApp } from './utils/app.js'
import { makeCategory, makeProduct } from './utils/factories.js'
import type { RecordingLowStockAlerter } from './utils/services.js'
import { resetDatabase, testPrisma } from './utils/test-db.js'

const db = testPrisma()
afterAll(() => db.$disconnect())

describe('inventory API — as admin', () => {
  let app: NestExpressApplication
  let alerter: RecordingLowStockAlerter
  const http = () => request(app.getHttpServer())

  beforeAll(async () => {
    app = await createTestApp({ asAdmin: true })
    alerter = app.get(LOW_STOCK_ALERTER)
  })
  afterAll(() => app.close())
  beforeEach(async () => {
    await resetDatabase()
    alerter.alerts.length = 0
    await db.setting.create({ data: { key: 'low_stock_threshold', value: 5 } })
  })

  async function seed() {
    const tees = await makeCategory({ name: 'Tees' })
    const tee = await makeProduct({
      categoryId: tees.id,
      name: 'Basic Tee',
      variants: [
        { size: 'S', color: 'White', stock: 0 },
        { size: 'M', color: 'White', stock: 3 },
        { size: 'L', color: 'White', stock: 40 },
      ],
    })
    const draft = await makeProduct({
      categoryId: tees.id,
      name: 'Draft Polo',
      status: 'DRAFT',
      variants: [{ size: 'M', color: 'Navy', stock: 1 }],
    })
    return { tees, tee, draft }
  }

  it('lists every live variant, lowest stock first, with effective thresholds', async () => {
    const { tee } = await seed()
    await db.productVariant.update({
      where: { id: tee.variants[2]!.id },
      data: { lowStockThreshold: 50 },
    })

    const res = await http().get('/api/v1/inventory').expect(200)
    expect(res.body.data.total).toBe(4) // drafts included in the full list
    expect(
      res.body.data.items.map(
        (r: {
          sku: string
          stock: number
          threshold: number
          usesStoreThreshold: boolean
          isLow: boolean
        }) => [r.stock, r.threshold, r.usesStoreThreshold, r.isLow],
      ),
    ).toEqual([
      [0, 5, true, true],
      [1, 5, true, true],
      [3, 5, true, true],
      [40, 50, false, true],
    ])
  })

  it('searches by SKU or product name, filters out-of-stock and by category', async () => {
    const { tee } = await seed()
    const other = await makeCategory({ name: 'Jeans' })
    await makeProduct({ categoryId: other.id, name: 'Slim Jeans' })

    const byName = await http().get('/api/v1/inventory?q=polo').expect(200)
    expect(
      byName.body.data.items.map((r: { product: { name: string } }) => r.product.name),
    ).toEqual(['Draft Polo'])
    const bySku = await http()
      .get(`/api/v1/inventory?q=${tee.variants[0]!.sku.toLowerCase()}`)
      .expect(200)
    expect(bySku.body.data.total).toBe(1)
    const out = await http().get('/api/v1/inventory?stock=out').expect(200)
    expect(out.body.data.items.map((r: { size: string }) => r.size)).toEqual(['S'])
    const jeans = await http().get(`/api/v1/inventory?category=${other.slug}`).expect(200)
    expect(jeans.body.data.total).toBe(1)
  })

  it('low-stock lists active variants of published products only', async () => {
    await seed()
    const res = await http().get('/api/v1/inventory/low-stock').expect(200)
    expect(res.body.data.threshold).toBe(5)
    // S (0) and M (3) of the published tee; NOT the draft polo, NOT L (40)
    expect(
      res.body.data.items.map((r: { size: string; stock: number }) => [r.size, r.stock]),
    ).toEqual([
      ['S', 0],
      ['M', 3],
    ])
  })

  it('adjusts by a change and by an exact count, each logged with its note', async () => {
    const { tee } = await seed()
    const l = tee.variants[2]!
    const added = await http()
      .patch(`/api/v1/inventory/${l.id}/adjust`)
      .send({ change: 10, note: 'Received shipment' })
      .expect(200)
    expect(added.body.data).toMatchObject({ before: 40, after: 50, change: 10 })
    expect(added.body.data).not.toHaveProperty('alert')

    await http()
      .patch(`/api/v1/inventory/${l.id}/adjust`)
      .send({ setTo: 44, note: 'Monthly count' })
      .expect(200)

    const log = await http().get(`/api/v1/inventory/${l.id}/log`).expect(200)
    expect(
      log.body.data.items.map(
        (e: { change: number; stockAfter: number; reason: string; note: string }) => [
          e.change,
          e.stockAfter,
          e.reason,
          e.note,
        ],
      ),
    ).toEqual([
      [-6, 44, 'MANUAL_ADJUSTMENT', 'Monthly count'], // newest first
      [10, 50, 'MANUAL_ADJUSTMENT', 'Received shipment'],
      // (no INITIAL_STOCK row: the test factory writes rows directly, bypassing the
      // service — starting-stock logging is covered in products/variants tests)
    ])
  })

  it('sends one low-stock alert when a manual change crosses the threshold', async () => {
    const { tee } = await seed()
    const l = tee.variants[2]! // 40
    await http()
      .patch(`/api/v1/inventory/${l.id}/adjust`)
      .send({ setTo: 5, note: 'Count' })
      .expect(200)
    await http()
      .patch(`/api/v1/inventory/${l.id}/adjust`)
      .send({ change: -1, note: 'Damaged' })
      .expect(200)
    expect(alerter.alerts).toEqual([
      expect.objectContaining({
        productName: 'Basic Tee',
        variantLabel: 'L / White',
        stock: 5,
        threshold: 5,
      }),
    ])
  })

  it('refuses to remove more than is in stock', async () => {
    const { tee } = await seed()
    const res = await http()
      .patch(`/api/v1/inventory/${tee.variants[1]!.id}/adjust`)
      .send({ change: -4, note: 'Oops' })
      .expect(409)
    expect(res.body.message).toBe("Can't remove 4: only 3 in stock.")
  })

  it.each([
    ['neither change nor setTo', { note: 'x note' }],
    ['both change and setTo', { change: 1, setTo: 5, note: 'x note' }],
    ['zero change', { change: 0, note: 'x note' }],
    ['decimal change', { change: 1.5, note: 'x note' }],
    ['negative setTo', { setTo: -1, note: 'x note' }],
    ['missing note', { change: 1 }],
    ['blank note', { change: 1, note: '   ' }],
    ['stock as text', { change: '5', note: 'x note' }],
  ])('rejects: %s', async (_label, body) => {
    const { tee } = await seed()
    await http().patch(`/api/v1/inventory/${tee.variants[0]!.id}/adjust`).send(body).expect(400)
    expect(await db.inventoryLog.count({ where: { reason: 'MANUAL_ADJUSTMENT' } })).toBe(0)
  })

  it('404s for unknown variants; history still works for archived ones', async () => {
    const { tee } = await seed()
    const unknown = '00000000-0000-0000-0000-000000000000'
    await http()
      .patch(`/api/v1/inventory/${unknown}/adjust`)
      .send({ change: 1, note: 'x note' })
      .expect(404)
    await http().get(`/api/v1/inventory/${unknown}/log`).expect(404)

    await db.productVariant.update({
      where: { id: tee.variants[2]!.id },
      data: { deletedAt: new Date() },
    })
    await http().get(`/api/v1/inventory/${tee.variants[2]!.id}/log`).expect(200)
    await http()
      .patch(`/api/v1/inventory/${tee.variants[2]!.id}/adjust`)
      .send({ change: 1, note: 'x note' })
      .expect(404)
  })

  it('a CSV import that drops stock below the threshold also sends an alert', async () => {
    const { tee } = await seed()
    const l = tee.variants[2]!
    await http()
      .post('/api/v1/products/import')
      .attach('file', Buffer.from(`product_slug,sku,stock\n${tee.slug},${l.sku},2\n`), 'stock.csv')
      .expect(201)
    expect(alerter.alerts).toEqual([expect.objectContaining({ sku: l.sku, stock: 2 })])
  })
})

describe('inventory API — without admin access', () => {
  let app: NestExpressApplication
  beforeAll(async () => {
    app = await createTestApp({ asAdmin: false })
  })
  afterAll(() => app.close())

  it.each([
    ['GET', '/api/v1/inventory'],
    ['GET', '/api/v1/inventory/low-stock'],
    ['PATCH', '/api/v1/inventory/00000000-0000-0000-0000-000000000000/adjust'],
    ['GET', '/api/v1/inventory/00000000-0000-0000-0000-000000000000/log'],
  ])('refuses %s %s with 401', async (method, url) => {
    const agent = request(app.getHttpServer())
    await (
      method === 'GET' ? agent.get(url) : agent.patch(url).send({ change: 1, note: 'x' })
    ).expect(401)
  })
})
