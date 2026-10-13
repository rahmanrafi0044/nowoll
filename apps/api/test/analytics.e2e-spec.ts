// Step 29b: the numbers on the admin dashboard. Every figure below is worked
// out by hand from the orders this file creates, with "now" pinned to
// 6 Oct 2026, 12:00 in Dhaka (06:00 UTC).
//
// The traps being tested:
//   • Dhaka midnight ≠ UTC midnight (00:30 Dhaka on the 6th is 18:30 UTC on the 5th)
//   • only CONFIRMED / PROCESSING / SHIPPED / DELIVERED count as sales
//   • range edges: the first instant of a day is in, the instant before is not
import { randomUUID } from 'node:crypto'
import type { NestExpressApplication } from '@nestjs/platform-express'
import { Prisma } from '@nowoll/database'
import request from 'supertest'
import { AnalyticsService } from '../src/analytics/analytics.service.js'
import { periodFor } from '../src/analytics/period.js'
import { createTestApp } from './utils/app.js'
import { makeCategory, makeProduct } from './utils/factories.js'
import { resetDatabase, testPrisma } from './utils/test-db.js'

const db = testPrisma()
afterAll(() => db.$disconnect())

const NOW = new Date('2026-10-06T06:00:00Z') // 12:00 noon in Dhaka, 6 Oct
/** The last N shop days up to NOW, or from/to dates. */
const last = (days: number) => periodFor({ days }, NOW)
const dates = (from: string, to: string) => periodFor({ from, to, days: 30 }, NOW)
type Status =
  'PENDING' | 'CONFIRMED' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED' | 'RETURNED'

let n = 0
/** An order with the given status/total, placed at `at` (UTC). */
async function order(
  at: string,
  status: Status,
  total: number,
  extra: {
    method?: 'COD' | 'SSLCOMMERZ'
    paymentStatus?: 'PENDING' | 'PAID' | 'UNDER_REVIEW'
    items?: { productId?: string | null; name: string; quantity: number; lineTotal: number }[]
    userId?: string
    email?: string
    name?: string
    zone?: string
  } = {},
) {
  n += 1
  const items = extra.items ?? [{ name: `Item ${n}`, quantity: 1, lineTotal: total }]
  return db.order.create({
    data: {
      userId: extra.userId ?? null,
      status,
      paymentMethod: extra.method ?? 'COD',
      paymentStatus: extra.paymentStatus ?? 'PENDING',
      email: extra.email ?? `buyer${n}@example.com`,
      phone: '+8801712345678',
      customerName: extra.name ?? 'Buyer',
      shippingAddressLine1: 'House 1',
      shippingDistrict: 'Dhaka',
      shippingDivision: 'Dhaka',
      shippingZoneName: extra.zone ?? 'Inside Dhaka',
      subtotal: new Prisma.Decimal(total),
      total: new Prisma.Decimal(total),
      createdAt: new Date(at),
      items: {
        create: items.map((i) => ({
          productId: i.productId ?? null,
          productName: i.name,
          variantLabel: 'M',
          sku: `SKU-${n}-${i.name}`,
          unitPrice: new Prisma.Decimal(i.lineTotal / i.quantity),
          quantity: i.quantity,
          lineTotal: new Prisma.Decimal(i.lineTotal),
        })),
      },
    },
  })
}

describe('analytics (step 29b)', () => {
  let app: NestExpressApplication
  let analytics: AnalyticsService

  beforeAll(async () => {
    app = await createTestApp({ asAdmin: true })
    analytics = app.get(AnalyticsService)
  })
  afterAll(() => app.close())
  beforeEach(() => resetDatabase())

  describe('summary', () => {
    it('sales today / last 7 days / the 7 before — by DHAKA day, sale statuses only', async () => {
      // Today (6 Oct in Dhaka)
      await order('2026-10-05T18:30:00Z', 'CONFIRMED', 1000) // 00:30 Dhaka on the 6th — TODAY, though UTC says the 5th
      await order('2026-10-06T05:00:00Z', 'SHIPPED', 300)
      await order('2026-10-06T05:10:00Z', 'PENDING', 999) // COD not yet confirmed — not a sale
      await order('2026-10-06T05:20:00Z', 'CANCELLED', 700)
      // Earlier this week
      await order('2026-10-05T17:30:00Z', 'DELIVERED', 500) // 23:30 Dhaka on the 5th — NOT today
      await order('2026-10-03T08:00:00Z', 'RETURNED', 800) // returned — not a sale
      await order('2026-09-29T18:00:00Z', 'PROCESSING', 200) // 30 Sep 00:00:00 Dhaka — first instant of the week: IN
      // The week before
      await order('2026-09-29T17:59:59Z', 'DELIVERED', 4000) // one second earlier — the week BEFORE
      await order('2026-09-22T18:00:00Z', 'CONFIRMED', 600) // 23 Sep 00:00 Dhaka — first instant of the week before
      await order('2026-09-22T17:59:59Z', 'DELIVERED', 9999) // 22 Sep — too old for both

      const s = await analytics.summary(NOW)
      expect(s.today).toEqual({ date: '2026-10-06', revenue: '1300', orders: 2 })
      expect(s.last7Days).toEqual({
        from: '2026-09-30',
        to: '2026-10-06',
        revenue: '2000', // 1000 + 300 + 500 + 200
        orders: 4,
        averageOrderValue: '500',
      })
      expect(s.previous7Days).toEqual({ revenue: '4600', orders: 2 })
    })

    it('no sales → zeros (and an average of 0, not a division by zero)', async () => {
      const s = await analytics.summary(NOW)
      expect(s.today).toEqual({ date: '2026-10-06', revenue: '0', orders: 0 })
      expect(s.last7Days.averageOrderValue).toBe('0')
    })

    it('the average is rounded to the poisha', async () => {
      await order('2026-10-06T01:00:00Z', 'CONFIRMED', 100)
      await order('2026-10-06T02:00:00Z', 'CONFIRMED', 100)
      await order('2026-10-06T03:00:00Z', 'CONFIRMED', 101)
      expect((await analytics.summary(NOW)).last7Days.averageOrderValue).toBe('100.33')
    })

    it('needs attention: COD to confirm, to ship, payments to review, return requests', async () => {
      const buyer = await db.user.create({ data: { id: randomUUID(), email: 'b@example.com' } })
      await order('2026-10-06T01:00:00Z', 'PENDING', 1, { method: 'COD' }) // call the customer
      await order('2026-10-06T01:00:00Z', 'PENDING', 1, { method: 'SSLCOMMERZ' }) // unpaid online — nothing to do yet
      await order('2026-10-06T01:00:00Z', 'CONFIRMED', 1) // to ship
      await order('2026-10-06T01:00:00Z', 'PROCESSING', 1) // to ship
      await order('2026-10-06T01:00:00Z', 'SHIPPED', 1) // already gone
      await order('2026-10-06T01:00:00Z', 'PENDING', 1, {
        method: 'SSLCOMMERZ',
        paymentStatus: 'UNDER_REVIEW',
      })
      for (const status of ['REQUESTED', 'APPROVED'] as const) {
        const o = await order('2026-10-01T01:00:00Z', 'DELIVERED', 1, { userId: buyer.id })
        await db.returnRequest.create({
          data: { orderId: o.id, userId: buyer.id, reason: 'WRONG_SIZE', status },
        })
      }

      expect((await analytics.summary(NOW)).needsAttention).toEqual({
        codToConfirm: 1,
        toShip: 2,
        paymentsToReview: 1,
        returnRequests: 1,
      })
    })

    it('new customers: customer accounts only (not staff, not deleted), by Dhaka week', async () => {
      const user = (email: string, createdAt: string, extra: object = {}) =>
        db.user.create({
          data: { id: randomUUID(), email, createdAt: new Date(createdAt), ...extra },
        })
      await user('a@example.com', '2026-10-05T18:30:00Z')
      await user('b@example.com', '2026-09-29T18:00:00Z')
      await user('staff@nowoll.com', '2026-10-06T01:00:00Z', { role: 'STAFF' })
      await user('gone@example.com', '2026-10-06T01:00:00Z', { deletedAt: new Date() })
      await user('c@example.com', '2026-09-29T17:59:59Z') // the week before
      expect((await analytics.summary(NOW)).newCustomers).toEqual({
        last7Days: 2,
        previous7Days: 1,
      })
    })
  })

  describe('revenue per day', () => {
    it('every day of the range, oldest first, zero days included, grouped by Dhaka date', async () => {
      await order('2026-10-05T18:30:00Z', 'CONFIRMED', 1000) // 6 Oct in Dhaka
      await order('2026-10-05T17:30:00Z', 'DELIVERED', 500) // 5 Oct in Dhaka
      await order('2026-10-05T10:00:00Z', 'SHIPPED', 250) // 5 Oct
      await order('2026-10-05T11:00:00Z', 'CANCELLED', 7000) // not a sale
      await order('2026-09-29T18:00:00Z', 'PROCESSING', 200) // 30 Sep
      await order('2026-09-29T17:59:59Z', 'DELIVERED', 4000) // 29 Sep — outside 7 days

      const r = await analytics.revenue(last(7))
      expect(r.days).toEqual([
        { date: '2026-09-30', revenue: '200', orders: 1 },
        { date: '2026-10-01', revenue: '0', orders: 0 },
        { date: '2026-10-02', revenue: '0', orders: 0 },
        { date: '2026-10-03', revenue: '0', orders: 0 },
        { date: '2026-10-04', revenue: '0', orders: 0 },
        { date: '2026-10-05', revenue: '750', orders: 2 },
        { date: '2026-10-06', revenue: '1000', orders: 1 },
      ])
      expect(r.total).toBe('1950')
    })

    it('keeps the poisha (no rounding of sums)', async () => {
      await order('2026-10-06T01:00:00Z', 'CONFIRMED', 100.25)
      await order('2026-10-06T02:00:00Z', 'CONFIRMED', 0.5)
      const r = await analytics.revenue(last(1))
      expect(r.days).toEqual([{ date: '2026-10-06', revenue: '100.75', orders: 2 }])
    })
  })

  describe('top products', () => {
    it('by units sold, then sales; sale statuses only; deleted products kept by name', async () => {
      const c = await makeCategory()
      const shirt = await makeProduct({ categoryId: c.id, name: 'Oxford Shirt' })
      const panjabi = await makeProduct({ categoryId: c.id, name: 'Silk Panjabi' })
      const chino = await makeProduct({ categoryId: c.id, name: 'Chino' })
      await order('2026-10-06T01:00:00Z', 'CONFIRMED', 0, {
        items: [
          { productId: shirt.id, name: 'Oxford Shirt', quantity: 2, lineTotal: 2980 },
          { productId: panjabi.id, name: 'Silk Panjabi', quantity: 1, lineTotal: 3490 },
        ],
      })
      await order('2026-10-01T01:00:00Z', 'DELIVERED', 0, {
        items: [
          { productId: shirt.id, name: 'Oxford Shirt (old name)', quantity: 1, lineTotal: 1490 },
          { productId: panjabi.id, name: 'Silk Panjabi', quantity: 2, lineTotal: 6980 },
          { productId: null, name: 'Old Tee', quantity: 3, lineTotal: 1500 }, // product deleted since
          { productId: chino.id, name: 'Chino', quantity: 1, lineTotal: 1990 },
        ],
      })
      await order('2026-10-02T01:00:00Z', 'CANCELLED', 0, {
        items: [{ productId: chino.id, name: 'Chino', quantity: 50, lineTotal: 99500 }],
      })
      await order('2026-08-01T01:00:00Z', 'DELIVERED', 0, {
        items: [{ productId: chino.id, name: 'Chino', quantity: 50, lineTotal: 99500 }], // > 30 days ago
      })

      const top = await analytics.topProducts(last(30), 5)
      expect(top.from).toBe('2026-09-07')
      expect(top.to).toBe('2026-10-06')
      expect(top.items).toEqual([
        // Three products tie at 3 units — then the higher sales come first.
        {
          productId: panjabi.id,
          name: 'Silk Panjabi',
          slug: panjabi.slug,
          unitsSold: 3,
          revenue: '10470',
        },
        // Renamed since: today's name is shown, sales from both names add up.
        {
          productId: shirt.id,
          name: 'Oxford Shirt',
          slug: shirt.slug,
          unitsSold: 3,
          revenue: '4470',
        },
        { productId: null, name: 'Old Tee', slug: null, unitsSold: 3, revenue: '1500' },
        { productId: chino.id, name: 'Chino', slug: chino.slug, unitsSold: 1, revenue: '1990' },
      ])
    })

    it('limit', async () => {
      for (let i = 1; i <= 4; i++)
        await order('2026-10-06T01:00:00Z', 'CONFIRMED', 0, {
          items: [{ name: `Gone ${i}`, quantity: i, lineTotal: 100 * i }],
        })
      const top = await analytics.topProducts(last(30), 2)
      expect(top.items.map((p) => p.name)).toEqual(['Gone 4', 'Gone 3'])
    })
  })

  describe('HTTP', () => {
    const http = () => request(app.getHttpServer())

    it('answers with the shared shapes, never cached', async () => {
      const summary = await http().get('/api/v1/analytics/summary').expect(200)
      expect(summary.headers['cache-control']).toBe('no-store')
      expect(summary.body.data.needsAttention).toEqual(expect.any(Object))
      const revenue = await http().get('/api/v1/analytics/revenue').expect(200) // default 7 days
      expect(revenue.body.data.days).toHaveLength(7)
      const top = await http().get('/api/v1/analytics/top-products?days=7&limit=3').expect(200)
      expect(top.body.data.items).toEqual([])
    })

    it('rejects bad ranges', async () => {
      for (const q of [
        'days=0',
        'days=367', // at most a year (step 40)
        'days=abc',
        'from=2026-09-01', // both or neither
        'from=2026-09-31&to=2026-10-01', // no 31 September
        'from=2026-10-05&to=2026-10-01', // backwards
        'from=2025-01-01&to=2026-01-02', // over 366 days
        'from=1%2F9%2F2026&to=2026-10-01',
        'groupBy=year',
      ])
        await http().get(`/api/v1/analytics/revenue?${q}`).expect(400)
      for (const q of ['limit=0', 'limit=51', 'days=367'])
        await http().get(`/api/v1/analytics/top-products?${q}`).expect(400)
      await http().get('/api/v1/analytics/top-categories?level=brand').expect(400)
    })

    it('every analytics route is admin-only (staff + 2FA)', async () => {
      const outsider = await createTestApp({ asAdmin: false })
      try {
        for (const path of [
          'summary',
          'revenue',
          'top-products',
          'top-categories',
          'customers',
          'orders',
        ])
          await request(outsider.getHttpServer()).get(`/api/v1/analytics/${path}`).expect(401)
      } finally {
        await outsider.close()
      }
    })

    it('step 40: the dashboard numbers stay open to Staff; the detail is Admin only', async () => {
      const staff = await createTestApp({ asAdmin: true, role: 'STAFF' })
      try {
        const h = () => request(staff.getHttpServer())
        for (const path of ['summary', 'revenue', 'top-products'])
          await h().get(`/api/v1/analytics/${path}`).expect(200)
        for (const path of ['top-categories', 'customers', 'orders'])
          await h().get(`/api/v1/analytics/${path}`).expect(403)
      } finally {
        await staff.close()
      }
    })

    it('from/to over HTTP: answers for exactly those Dhaka days', async () => {
      const r = await http()
        .get('/api/v1/analytics/revenue?from=2026-09-01&to=2026-09-30')
        .expect(200)
      expect(r.body.data).toMatchObject({ from: '2026-09-01', to: '2026-09-30', groupBy: 'day' })
      expect(r.body.data.days).toHaveLength(30)
      expect(r.body.data.previous).toMatchObject({ from: '2026-08-02', to: '2026-08-31' })
    })
  })
})

// ── Step 40: the analytics page ─────────────────────────────────────────────
describe('analytics (step 40)', () => {
  let app: NestExpressApplication
  let analytics: AnalyticsService

  beforeAll(async () => {
    app = await createTestApp({ asAdmin: true })
    analytics = app.get(AnalyticsService)
  })
  afterAll(() => app.close())
  beforeEach(() => resetDatabase())

  describe('periods', () => {
    it('from/to = whole Dhaka days: 00:00 on the first day in, 00:00 after the last day out', async () => {
      await order('2026-08-31T18:00:00Z', 'CONFIRMED', 100) // 00:00 1 Sep Dhaka → in
      await order('2026-08-31T17:59:59Z', 'CONFIRMED', 999) // 23:59:59 31 Aug → out
      await order('2026-09-30T17:59:59Z', 'CONFIRMED', 50) // 23:59:59 30 Sep → in
      await order('2026-09-30T18:00:00Z', 'CONFIRMED', 999) // 00:00 1 Oct → out
      const r = await analytics.revenue(dates('2026-09-01', '2026-09-30'))
      expect(r).toMatchObject({ total: '150', orders: 2 })
    })

    it('previous period: the same number of days just before, with its own totals', async () => {
      await order('2026-09-05T06:00:00Z', 'DELIVERED', 300) // previous 7 days (30 Aug – 5 Sep)
      await order('2026-09-08T06:00:00Z', 'DELIVERED', 500) // the period (6 – 12 Sep)
      const r = await analytics.revenue(dates('2026-09-06', '2026-09-12'))
      expect(r.previous).toEqual({
        from: '2026-08-30',
        to: '2026-09-05',
        revenue: '300',
        orders: 1,
      })
      expect(r.total).toBe('500')
    })
  })

  describe('revenue chart grouping', () => {
    it('by day up to 92 days, by 7-day blocks beyond (the last block may be short)', async () => {
      expect((await analytics.revenue(last(92))).groupBy).toBe('day')
      await order('2026-01-01T06:00:00Z', 'CONFIRMED', 70) // in the first block
      await order('2026-01-08T06:00:00Z', 'CONFIRMED', 30) // the second block
      const r = await analytics.revenue(dates('2026-01-01', '2026-04-30')) // 120 days
      expect(r.groupBy).toBe('week')
      expect(r.points).toHaveLength(18) // 17 full weeks + 1 day
      expect(r.points[0]).toEqual({
        start: '2026-01-01',
        end: '2026-01-07',
        revenue: '70',
        orders: 1,
      })
      expect(r.points[1]).toMatchObject({ start: '2026-01-08', revenue: '30' })
      expect(r.points.at(-1)).toMatchObject({ start: '2026-04-30', end: '2026-04-30' })
    })

    it('by calendar month when asked (partial first and last months)', async () => {
      await order('2026-09-20T06:00:00Z', 'CONFIRMED', 10)
      await order('2026-10-01T06:00:00Z', 'CONFIRMED', 20)
      const r = await analytics.revenue(dates('2026-09-15', '2026-11-10'), 'month')
      expect(r.points).toEqual([
        { start: '2026-09-15', end: '2026-09-30', revenue: '10', orders: 1 },
        { start: '2026-10-01', end: '2026-10-31', revenue: '20', orders: 1 },
        { start: '2026-11-01', end: '2026-11-10', revenue: '0', orders: 0 },
      ])
      expect(r.days).toHaveLength(57) // the daily list is always there too
    })
  })

  describe('top categories', () => {
    it('each category with its path; rolled up to the top level; deleted products as "Unknown"', async () => {
      const men = await makeCategory({ name: 'Men' })
      const shirts = await makeCategory({ name: 'Shirts', parentId: men.id })
      const pants = await makeCategory({ name: 'Pants', parentId: men.id })
      const women = await makeCategory({ name: 'Women', isActive: false }) // hidden still counts
      const shirt = await makeProduct({ categoryId: shirts.id, name: 'Shirt' })
      const chino = await makeProduct({ categoryId: pants.id, name: 'Chino' })
      const kurti = await makeProduct({ categoryId: women.id, name: 'Kurti' })
      await order('2026-10-06T01:00:00Z', 'CONFIRMED', 0, {
        items: [
          { productId: shirt.id, name: 'Shirt', quantity: 2, lineTotal: 3000 },
          { productId: chino.id, name: 'Chino', quantity: 1, lineTotal: 2000 },
          { productId: kurti.id, name: 'Kurti', quantity: 1, lineTotal: 1500 },
          { productId: null, name: 'Old thing', quantity: 1, lineTotal: 100 },
        ],
      })
      await order('2026-10-06T02:00:00Z', 'CANCELLED', 0, {
        items: [{ productId: shirt.id, name: 'Shirt', quantity: 9, lineTotal: 9000 }], // not a sale
      })
      await order('2026-09-28T02:00:00Z', 'DELIVERED', 0, {
        items: [{ productId: shirt.id, name: 'Shirt', quantity: 1, lineTotal: 400 }], // previous 7 days
      })

      const each = await analytics.topCategories(last(7), 'category', 10)
      expect(each.items).toEqual([
        {
          categoryId: shirts.id,
          name: 'Shirts',
          path: 'Men > Shirts',
          unitsSold: 2,
          revenue: '3000',
        },
        { categoryId: pants.id, name: 'Pants', path: 'Men > Pants', unitsSold: 1, revenue: '2000' },
        { categoryId: women.id, name: 'Women', path: 'Women', unitsSold: 1, revenue: '1500' },
        {
          categoryId: null,
          name: 'Unknown category',
          path: 'Unknown category',
          unitsSold: 1,
          revenue: '100',
        },
      ])
      expect(each).toMatchObject({ total: '6600', previousTotal: '400', level: 'category' })

      const top = await analytics.topCategories(last(7), 'top', 10)
      expect(top.items.map((c) => [c.path, c.revenue, c.unitsSold])).toEqual([
        ['Men', '5000', 3],
        ['Women', '1500', 1],
        ['Unknown category', '100', 1],
      ])
      expect((await analytics.topCategories(last(7), 'category', 2)).items).toHaveLength(2)
      expect((await analytics.topCategories(last(7), 'category', 2)).total).toBe('6600') // all, not just shown
    })
  })

  describe('customers', () => {
    it('by email (guests too): new vs returning, repeat rate, top spenders — no addresses', async () => {
      // Rafi bought before the period → returning; buys twice inside.
      await order('2026-08-01T06:00:00Z', 'DELIVERED', 100, { email: 'rafi@example.com' })
      await order('2026-10-01T06:00:00Z', 'DELIVERED', 2000, {
        email: 'Rafi@Example.com',
        name: 'Rafi',
      })
      await order('2026-10-05T06:00:00Z', 'CONFIRMED', 1000, {
        email: 'rafi@example.com',
        name: 'Rafi R.',
      })
      // Mita: first ever purchase inside → new.
      await order('2026-10-02T06:00:00Z', 'SHIPPED', 2500, {
        email: 'mita@example.com',
        name: 'Mita',
      })
      // A cancelled order doesn't make a customer; nor does an unconfirmed one.
      await order('2026-10-03T06:00:00Z', 'CANCELLED', 9999, { email: 'no@example.com' })
      await order('2026-10-03T06:00:00Z', 'PENDING', 9999, { email: 'no@example.com' })

      const r = await analytics.customers(last(7), 10)
      expect(r).toMatchObject({
        customers: 2,
        newCustomers: 1,
        returningCustomers: 1,
        repeatRate: 50, // 1 of 2 bought twice
      })
      expect(r.topCustomers).toEqual([
        { email: 'rafi@example.com', name: 'Rafi R.', userId: null, orders: 2, spent: '3000' },
        { email: 'mita@example.com', name: 'Mita', userId: null, orders: 1, spent: '2500' },
      ])
      expect(JSON.stringify(r)).not.toMatch(/House|\+880/) // never address or phone
    })

    it('previous period counts; nobody → zeros, not a division by zero', async () => {
      const empty = await analytics.customers(last(7), 10)
      expect(empty).toMatchObject({
        customers: 0,
        newCustomers: 0,
        repeatRate: 0,
        topCustomers: [],
      })
      await order('2026-09-25T06:00:00Z', 'DELIVERED', 100, { email: 'a@example.com' })
      expect((await analytics.customers(last(7), 10)).previous).toEqual({
        customers: 1,
        newCustomers: 1,
      })
    })
  })

  describe('order outcomes', () => {
    it('every order placed in the period, where it is now; cancellation rate; splits of sales', async () => {
      await order('2026-10-01T06:00:00Z', 'DELIVERED', 1000)
      await order('2026-10-02T06:00:00Z', 'SHIPPED', 500, {
        method: 'SSLCOMMERZ',
        zone: 'Outside Dhaka',
      })
      await order('2026-10-03T06:00:00Z', 'PENDING', 700)
      await order('2026-10-04T06:00:00Z', 'CANCELLED', 900)
      await order('2026-10-04T07:00:00Z', 'RETURNED', 300)
      await order('2026-09-25T06:00:00Z', 'CANCELLED', 100) // previous period
      await order('2026-09-26T06:00:00Z', 'DELIVERED', 100)

      const r = await analytics.orders(last(7))
      expect(r).toMatchObject({
        placed: 5,
        outcomes: { sale: 2, delivered: 1, pending: 1, cancelled: 1, returned: 1 },
        cancellationRate: 20,
        previous: { placed: 2, cancellationRate: 50 },
      })
      expect(r.byPaymentMethod).toEqual([
        { method: 'COD', orders: 1, revenue: '1000' },
        { method: 'SSLCOMMERZ', orders: 1, revenue: '500' },
      ])
      expect(r.byZone).toEqual([
        { zone: 'Inside Dhaka', orders: 1, revenue: '1000' },
        { zone: 'Outside Dhaka', orders: 1, revenue: '500' },
      ])
    })

    it('no orders → zeros and empty splits', async () => {
      expect(await analytics.orders(last(7))).toMatchObject({
        placed: 0,
        cancellationRate: 0,
        byPaymentMethod: [],
        byZone: [],
      })
    })
  })
})
