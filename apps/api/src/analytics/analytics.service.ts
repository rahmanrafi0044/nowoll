import { Injectable } from '@nestjs/common'
import { Prisma } from '@nowoll/database'
import {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  ReturnStatus,
  UserRole,
} from '@nowoll/database/enums'
import type { AnalyticsSummary, RevenueSeries, SalesTotals, TopProducts } from '@nowoll/types'
import { PrismaService } from '../prisma/prisma.service.js'
import { addDays, STORE_TIME_ZONE, storeDate, storeDays } from './store-time.js'

// ============================================================================
// Numbers for the admin dashboard (step 29b) and, later, the analytics page
// (step 40). Read-only: nothing here ever changes data.
//
// What counts as a SALE (one rule, used everywhere below):
//   status CONFIRMED, PROCESSING, SHIPPED or DELIVERED — counted on the shop
//   day the order was PLACED. Not PENDING (an unpaid online order, or a COD
//   order nobody has confirmed by phone yet), not CANCELLED, not RETURNED.
// Partial refunds are not subtracted here — the dashboard says "Sales".
//
// `now` is a parameter so tests can pin "today"; the controller passes nothing.
// ============================================================================
export const SALE_STATUSES = [
  OrderStatus.CONFIRMED,
  OrderStatus.PROCESSING,
  OrderStatus.SHIPPED,
  OrderStatus.DELIVERED,
]

type Range = { from: Date; to: Date }

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  /** GET /analytics/summary — the KPI cards and the "needs attention" box. */
  async summary(now = new Date()): Promise<AnalyticsSummary> {
    const today = storeDate(now)
    const day = storeDays(today, 1)
    const week = storeDays(today, 7)
    const before = storeDays(addDays(week.first, -1), 7) // the 7 days before those

    const [todaySales, weekSales, beforeSales, newNow, newBefore, attention] = await Promise.all([
      this.sales(day),
      this.sales(week),
      this.sales(before),
      this.newCustomers(week),
      this.newCustomers(before),
      this.needsAttention(),
    ])
    return {
      today: { date: today, ...todaySales },
      last7Days: {
        from: week.first,
        to: week.last,
        ...weekSales,
        averageOrderValue:
          weekSales.orders === 0
            ? '0'
            : new Prisma.Decimal(weekSales.revenue)
                .dividedBy(weekSales.orders)
                .toDecimalPlaces(2)
                .toString(),
      },
      previous7Days: beforeSales,
      newCustomers: { last7Days: newNow, previous7Days: newBefore },
      needsAttention: attention,
    }
  }

  /** GET /analytics/revenue?days=N — sales per shop day, empty days included. */
  async revenue(days: number, now = new Date()): Promise<RevenueSeries> {
    const range = storeDays(storeDate(now), days)
    // GROUP BY the order's DHAKA calendar day. created_at is a plain UTC
    // timestamp, so: "this is UTC" → "now show it in Dhaka" → take the date.
    const rows = await this.prisma.$queryRaw<{ day: string; revenue: string; orders: number }[]>`
      SELECT to_char((created_at AT TIME ZONE 'UTC') AT TIME ZONE ${STORE_TIME_ZONE}, 'YYYY-MM-DD') AS day,
             SUM(total)::text AS revenue,
             COUNT(*)::int AS orders
      FROM orders
      WHERE status::text = ANY(${SALE_STATUSES})
        AND created_at >= ${range.from} AND created_at < ${range.to}
      GROUP BY 1`
    const byDay = new Map(rows.map((r) => [r.day, r]))
    const series = range.dates.map((date) => {
      const r = byDay.get(date)
      return { date, revenue: r ? decimal(r.revenue) : '0', orders: r?.orders ?? 0 }
    })
    const total = series.reduce((sum, d) => sum.plus(d.revenue), new Prisma.Decimal(0))
    return { days: series, total: total.toString() }
  }

  /** GET /analytics/top-products — best sellers by units, then by sales. */
  async topProducts(days: number, limit: number, now = new Date()): Promise<TopProducts> {
    const range = storeDays(storeDate(now), days)
    // One row per product. A product deleted since (product_id now NULL) is
    // grouped by the name the order recorded, so it still shows up.
    const rows = await this.prisma.$queryRaw<
      {
        productId: string | null
        name: string
        slug: string | null
        unitsSold: number
        revenue: string
      }[]
    >`
      SELECT oi.product_id::text AS "productId",
             COALESCE(p.name, MAX(oi.product_name)) AS name,
             p.slug AS slug,
             SUM(oi.quantity)::int AS "unitsSold",
             SUM(oi.line_total)::text AS revenue
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      LEFT JOIN products p ON p.id = oi.product_id
      WHERE o.status::text = ANY(${SALE_STATUSES})
        AND o.created_at >= ${range.from} AND o.created_at < ${range.to}
      GROUP BY oi.product_id, p.name, p.slug,
               CASE WHEN oi.product_id IS NULL THEN oi.product_name END
      ORDER BY "unitsSold" DESC, SUM(oi.line_total) DESC, name ASC
      LIMIT ${limit}`
    return {
      from: range.first,
      to: range.last,
      items: rows.map((r) => ({ ...r, revenue: decimal(r.revenue) })),
    }
  }

  private async sales({ from, to }: Range): Promise<SalesTotals> {
    const r = await this.prisma.order.aggregate({
      where: { status: { in: SALE_STATUSES }, createdAt: { gte: from, lt: to } },
      _sum: { total: true },
      _count: true,
    })
    return { revenue: (r._sum.total ?? new Prisma.Decimal(0)).toString(), orders: r._count }
  }

  /** Customer accounts created in the range (staff and deleted accounts not counted). */
  private newCustomers({ from, to }: Range): Promise<number> {
    return this.prisma.user.count({
      where: { role: UserRole.CUSTOMER, deletedAt: null, createdAt: { gte: from, lt: to } },
    })
  }

  private async needsAttention(): Promise<AnalyticsSummary['needsAttention']> {
    const [codToConfirm, toShip, paymentsToReview, returnRequests] = await Promise.all([
      this.prisma.order.count({
        where: { status: OrderStatus.PENDING, paymentMethod: PaymentMethod.COD },
      }),
      this.prisma.order.count({
        where: { status: { in: [OrderStatus.CONFIRMED, OrderStatus.PROCESSING] } },
      }),
      this.prisma.order.count({ where: { paymentStatus: PaymentStatus.UNDER_REVIEW } }),
      this.prisma.returnRequest.count({ where: { status: ReturnStatus.REQUESTED } }),
    ])
    return { codToConfirm, toShip, paymentsToReview, returnRequests }
  }
}

/** "1490.00" → "1490" — the same money format as everywhere else in the API. */
const decimal = (s: string) => new Prisma.Decimal(s).toString()
