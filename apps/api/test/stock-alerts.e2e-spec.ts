// 38f: "Notify me when it's back". A shopper leaves an email for a sold-out
// size; when the SHOP restocks it (not an order being cancelled), one
// 'back-in-stock' job is queued — only if someone is waiting.
import type { NestExpressApplication } from '@nestjs/platform-express'
import request from 'supertest'
import { StockService } from '../src/inventory/stock.service.js'
import { CUSTOMER_NOTIFIER } from '../src/notifications/customer-notifier.js'
import { createTestApp } from './utils/app.js'
import { makeCategory, makeProduct } from './utils/factories.js'
import type { RecordingCustomerNotifier } from './utils/services.js'
import { resetDatabase, testPrisma } from './utils/test-db.js'

const db = testPrisma()
afterAll(() => db.$disconnect())

describe('back-in-stock alerts (38f)', () => {
  let app: NestExpressApplication
  let events: RecordingCustomerNotifier['events']
  const http = () => request(app.getHttpServer())
  // A different visitor IP each time: the form allows 5 a minute per IP (tested last).
  let ip = 0
  const ask = (variantId: string, email: string) =>
    http()
      .post('/api/v1/stock-alerts')
      .set('X-Forwarded-For', `10.9.0.${++ip % 250}`)
      .send({ variantId, email })

  beforeAll(async () => {
    app = await createTestApp({ asAdmin: true })
    events = app.get<RecordingCustomerNotifier>(CUSTOMER_NOTIFIER).events
  })
  afterAll(() => app.close())
  beforeEach(async () => {
    await resetDatabase()
    events.length = 0
  })

  async function seed() {
    const c = await makeCategory()
    const p = await makeProduct({
      categoryId: c.id,
      variants: [
        { size: 'S', color: 'Ivory', stock: 0 },
        { size: 'M', color: 'Ivory', stock: 4 },
      ],
    })
    return { p, soldOut: p.variants[0]!, inStock: p.variants[1]! }
  }

  it('saves one row per person and size; the same answer every time', async () => {
    const { soldOut } = await seed()
    expect((await ask(soldOut.id, ' Rafi@Example.com ').expect(200)).body.data).toEqual({
      waiting: true,
    })
    await ask(soldOut.id, 'rafi@example.com').expect(200)
    const rows = await db.stockAlert.findMany()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ email: 'rafi@example.com', notifiedAt: null })
  })

  it('refuses sizes that are in stock, gone, or not for sale — and bad emails', async () => {
    const { p, inStock, soldOut } = await seed()
    expect((await ask(inStock.id, 'a@example.com').expect(409)).body.error).toBe('IN_STOCK')
    await ask(soldOut.id, 'not-an-email').expect(400)
    await db.product.update({ where: { id: p.id }, data: { status: 'DRAFT' } })
    await ask(soldOut.id, 'a@example.com').expect(404)
    await ask('00000000-0000-4000-8000-000000000000', 'a@example.com').expect(404)
    expect(await db.stockAlert.count()).toBe(0)
  })

  it('a restock queues ONE job when someone waits; nothing when nobody does', async () => {
    const { soldOut, inStock } = await seed()
    await ask(soldOut.id, 'a@example.com').expect(200)
    await ask(soldOut.id, 'b@example.com').expect(200)

    // A cancelled order putting a piece back is not the shop restocking.
    // (Reported the way the order code does it: after the change is saved.)
    const stock = app.get(StockService)
    const change = await db.$transaction((tx) =>
      stock.adjust(tx, {
        variantId: soldOut.id,
        adjustment: { change: 1 },
        reason: 'ORDER_CANCELLED',
      }),
    )
    await stock.notifyLowStock([change])
    expect(change.backInStock).toBe(false)
    expect(events.filter((e) => e.type === 'back-in-stock')).toEqual([])
    await db.productVariant.update({ where: { id: soldOut.id }, data: { stock: 0 } })

    await http()
      .patch(`/api/v1/inventory/${soldOut.id}/adjust`)
      .send({ change: 5, note: 'Restocked' })
      .expect(200)
    expect(events.filter((e) => e.type === 'back-in-stock')).toEqual([
      { type: 'back-in-stock', id: soldOut.id },
    ])

    // A size nobody waits for: restocking it queues nothing.
    await db.productVariant.update({ where: { id: inStock.id }, data: { stock: 0 } })
    await http()
      .patch(`/api/v1/inventory/${inStock.id}/adjust`)
      .send({ change: 5, note: 'Restocked' })
      .expect(200)
    expect(events.filter((e) => e.type === 'back-in-stock')).toHaveLength(1)
  })

  it('the admin product page shows how many wait for each size', async () => {
    const { p, soldOut } = await seed()
    await ask(soldOut.id, 'a@example.com').expect(200)
    await ask(soldOut.id, 'b@example.com').expect(200)
    // Already emailed — no longer waiting.
    await db.stockAlert.updateMany({
      where: { email: 'b@example.com' },
      data: { notifiedAt: new Date() },
    })
    const variants = (await http().get(`/api/v1/admin/products/${p.id}`).expect(200)).body.data
      .variants as { size: string; waiting: number }[]
    expect(variants.map((v) => [v.size, v.waiting])).toEqual([
      ['S', 1],
      ['M', 0],
    ])
  })

  it('allows 5 requests a minute from one visitor', async () => {
    const { soldOut } = await seed()
    const fromOne = () =>
      http()
        .post('/api/v1/stock-alerts')
        .set('X-Forwarded-For', '10.9.9.9')
        .send({ variantId: soldOut.id, email: 'a@example.com' })
    for (let i = 0; i < 5; i++) await fromOne().expect(200)
    await fromOne().expect(429)
  })
})
