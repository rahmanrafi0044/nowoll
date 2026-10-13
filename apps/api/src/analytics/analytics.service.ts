import { Injectable } from '@nestjs/common'
import { Prisma } from '@nowoll/database'
import {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  ReturnStatus,
  UserRole,
} from '@nowoll/database/enums'
import type {
  AnalyticsSummary,
  CustomersReport,
  OrdersReport,
  RevenuePoint,
  RevenueSeries,
  SalesTotals,
  TopCategories,
  TopCategory,
  TopProducts,
} from '@nowoll/types'
import { PrismaService } from '../prisma/prisma.service.js'
import { type Period, previousPeriod } from './period.js'
import { addDays, STORE_TIME_ZONE, storeDate, storeDays } from './store-time.js'

// ============================================================================
// Numbers for the admin dashboard (step 29b) and the analytics page (step 40).
// Read-only: nothing here ever changes data. Definitions: docs/analytics.md.
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

  /**
   * GET /analytics/revenue — sales per shop day, empty days included, plus the
   * chart's points (by day up to 92 days, else 7-day blocks — or as asked)
   * and the previous period of the same length.
   */
  async revenue(period: Period, groupBy?: RevenueSeries['groupBy']): Promise<RevenueSeries> {
    const previous = previousPeriod(period)
    // GROUP BY the order's DHAKA calendar day. created_at is a plain UTC
    // timestamp, so: "this is UTC" → "now show it in Dhaka" → take the date.
    const [rows, before] = await Promise.all([
      this.prisma.$queryRaw<{ day: string; revenue: string; orders: number }[]>`
        SELECT to_char((created_at AT TIME ZONE 'UTC') AT TIME ZONE ${STORE_TIME_ZONE}, 'YYYY-MM-DD') AS day,
               SUM(total)::text AS revenue,
               COUNT(*)::int AS orders
        FROM orders
        WHERE status::text = ANY(${SALE_STATUSES})
          AND created_at >= ${period.from} AND created_at < ${period.to}
        GROUP BY 1`,
      this.sales(previous),
    ])
    const byDay = new Map(rows.map((r) => [r.day, r]))
    const days = period.dates.map((date) => {
      const r = byDay.get(date)
      return { date, revenue: r ? decimal(r.revenue) : '0', orders: r?.orders ?? 0 }
    })
    const total = days.reduce((sum, d) => sum.plus(d.revenue), new Prisma.Decimal(0))
    const grouping = groupBy ?? (days.length <= 92 ? 'day' : 'week')
    return {
      from: period.first,
      to: period.last,
      days,
      groupBy: grouping,
      points: groupDays(days, grouping),
      total: total.toString(),
      orders: days.reduce((n, d) => n + d.orders, 0),
      previous: { from: previous.first, to: previous.last, ...before },
    }
  }

  /** GET /analytics/top-products — best sellers by units, then by sales. */
  async topProducts(period: Period, limit: number): Promise<TopProducts> {
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
        AND o.created_at >= ${period.from} AND o.created_at < ${period.to}
      GROUP BY oi.product_id, p.name, p.slug,
               CASE WHEN oi.product_id IS NULL THEN oi.product_name END
      ORDER BY "unitsSold" DESC, SUM(oi.line_total) DESC, name ASC
      LIMIT ${limit}`
    return {
      from: period.first,
      to: period.last,
      items: rows.map((r) => ({ ...r, revenue: decimal(r.revenue) })),
    }
  }

  /**
   * GET /analytics/top-categories — line totals per product category (the
   * category the product is in NOW), or rolled up to the top level. Hidden
   * categories still count: sales happened. Deleted products → "Unknown category".
   */
  async topCategories(
    period: Period,
    level: TopCategories['level'],
    limit: number,
  ): Promise<TopCategories> {
    const previous = previousPeriod(period)
    const [rows, categories, previousTotal] = await Promise.all([
      this.prisma.$queryRaw<{ categoryId: string | null; unitsSold: number; revenue: string }[]>`
        SELECT p.category_id::text AS "categoryId",
               SUM(oi.quantity)::int AS "unitsSold",
               SUM(oi.line_total)::text AS revenue
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        LEFT JOIN products p ON p.id = oi.product_id
        WHERE o.status::text = ANY(${SALE_STATUSES})
          AND o.created_at >= ${period.from} AND o.created_at < ${period.to}
        GROUP BY 1`,
      this.prisma.category.findMany({ select: { id: true, name: true, parentId: true } }),
      this.lineTotal(previous),
    ])
    const byId = new Map(categories.map((c) => [c.id, c]))
    /** The chain top level → … → this category (a broken chain stops safely). */
    const chain = (id: string) => {
      const out: { id: string; name: string }[] = []
      const seen = new Set<string>()
      for (
        let c = byId.get(id);
        c && !seen.has(c.id);
        c = c.parentId ? byId.get(c.parentId) : undefined
      ) {
        seen.add(c.id)
        out.unshift({ id: c.id, name: c.name })
      }
      return out
    }

    const groups = new Map<string, TopCategory & { sum: Prisma.Decimal }>()
    for (const r of rows) {
      const path = r.categoryId ? chain(r.categoryId) : []
      const target = level === 'top' ? path.slice(0, 1) : path
      const key = target.at(-1)?.id ?? 'unknown'
      const g = groups.get(key) ?? {
        categoryId: target.at(-1)?.id ?? null,
        name: target.at(-1)?.name ?? 'Unknown category',
        path: target.length ? target.map((c) => c.name).join(' > ') : 'Unknown category',
        unitsSold: 0,
        revenue: '0',
        sum: new Prisma.Decimal(0),
      }
      g.unitsSold += r.unitsSold
      g.sum = g.sum.plus(r.revenue)
      groups.set(key, g)
    }
    const all = [...groups.values()].sort(
      (a, b) =>
        b.sum.comparedTo(a.sum) || b.unitsSold - a.unitsSold || a.path.localeCompare(b.path),
    )
    const total = all.reduce((t, g) => t.plus(g.sum), new Prisma.Decimal(0))
    return {
      from: period.first,
      to: period.last,
      level,
      items: all.slice(0, limit).map(({ sum, ...g }) => ({ ...g, revenue: sum.toString() })),
      total: total.toString(),
      previousTotal,
    }
  }

  /**
   * GET /analytics/customers — who bought in the period. A customer = an
   * email (lower-case), so guests count too. New = their first purchase ever
   * was in the period; returning = they had bought before it.
   */
  async customers(period: Period, limit: number): Promise<CustomersReport> {
    const previous = previousPeriod(period)
    const [counts, before, top] = await Promise.all([
      this.customerCounts(period),
      this.customerCounts(previous),
      this.prisma.$queryRaw<
        { email: string; name: string; userId: string | null; orders: number; spent: string }[]
      >`
        SELECT lower(email) AS email,
               (array_agg(customer_name ORDER BY created_at DESC))[1] AS name,
               (array_agg(user_id::text ORDER BY created_at DESC) FILTER (WHERE user_id IS NOT NULL))[1] AS "userId",
               COUNT(*)::int AS orders,
               SUM(total)::text AS spent
        FROM orders
        WHERE status::text = ANY(${SALE_STATUSES})
          AND created_at >= ${period.from} AND created_at < ${period.to}
        GROUP BY 1
        ORDER BY SUM(total) DESC, COUNT(*) DESC, 1 ASC
        LIMIT ${limit}`,
    ])
    return {
      from: period.first,
      to: period.last,
      customers: counts.customers,
      newCustomers: counts.newCustomers,
      returningCustomers: counts.customers - counts.newCustomers,
      repeatRate: percent(counts.repeat, counts.customers),
      previous: { customers: before.customers, newCustomers: before.newCustomers },
      topCustomers: top.map((t) => ({ ...t, spent: decimal(t.spent) })),
    }
  }

  /**
   * GET /analytics/orders — every order PLACED in the period and where it is
   * now (a sale, still unconfirmed, cancelled, returned), plus how sales split
   * by payment method and delivery zone.
   */
  async orders(period: Period): Promise<OrdersReport> {
    const previous = previousPeriod(period)
    const placedIn = (p: Period) => ({ createdAt: { gte: p.from, lt: p.to } })
    const saleIn = { status: { in: SALE_STATUSES }, ...placedIn(period) }
    const [byStatus, beforeByStatus, byMethod, byZone] = await Promise.all([
      this.prisma.order.groupBy({ by: ['status'], where: placedIn(period), _count: true }),
      this.prisma.order.groupBy({ by: ['status'], where: placedIn(previous), _count: true }),
      this.prisma.order.groupBy({
        by: ['paymentMethod'],
        where: saleIn,
        _count: true,
        _sum: { total: true },
      }),
      this.prisma.order.groupBy({
        by: ['shippingZoneName'],
        where: saleIn,
        _count: true,
        _sum: { total: true },
      }),
    ])
    const count = (rows: { status: OrderStatus; _count: number }[], ...statuses: OrderStatus[]) =>
      rows.filter((r) => statuses.includes(r.status)).reduce((n, r) => n + r._count, 0)
    const placed = count(byStatus, ...Object.values(OrderStatus))
    const cancelled = count(byStatus, OrderStatus.CANCELLED)
    const placedBefore = count(beforeByStatus, ...Object.values(OrderStatus))
    const money = (d: Prisma.Decimal | null) => (d ?? new Prisma.Decimal(0)).toString()
    return {
      from: period.first,
      to: period.last,
      placed,
      outcomes: {
        sale: count(byStatus, ...SALE_STATUSES),
        delivered: count(byStatus, OrderStatus.DELIVERED),
        pending: count(byStatus, OrderStatus.PENDING),
        cancelled,
        returned: count(byStatus, OrderStatus.RETURNED),
      },
      cancellationRate: percent(cancelled, placed),
      previous: {
        placed: placedBefore,
        cancellationRate: percent(count(beforeByStatus, OrderStatus.CANCELLED), placedBefore),
      },
      byPaymentMethod: byMethod
        .map((r) => ({ method: r.paymentMethod, orders: r._count, revenue: money(r._sum.total) }))
        .sort((a, b) => b.orders - a.orders || a.method.localeCompare(b.method)),
      byZone: byZone
        .map((r) => ({ zone: r.shippingZoneName, orders: r._count, revenue: money(r._sum.total) }))
        .sort((a, b) => b.orders - a.orders || a.zone.localeCompare(b.zone)),
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

  /** All line totals (before order discounts) of sales in the range. */
  private async lineTotal({ from, to }: Range): Promise<string> {
    const [r] = await this.prisma.$queryRaw<{ total: string | null }[]>`
      SELECT SUM(oi.line_total)::text AS total
      FROM order_items oi JOIN orders o ON o.id = oi.order_id
      WHERE o.status::text = ANY(${SALE_STATUSES})
        AND o.created_at >= ${from} AND o.created_at < ${to}`
    return r?.total ? decimal(r.total) : '0'
  }

  /** Buyers in the range (by email), how many were new, how many bought 2+ times. */
  private async customerCounts({ from, to }: Range) {
    const [r] = await this.prisma.$queryRaw<
      { customers: number; newCustomers: number; repeat: number }[]
    >`
      WITH sales AS (
        SELECT lower(email) AS email, created_at FROM orders WHERE status::text = ANY(${SALE_STATUSES})
      ),
      inside AS (
        SELECT email, COUNT(*) AS n FROM sales
        WHERE created_at >= ${from} AND created_at < ${to} GROUP BY email
      ),
      firsts AS (SELECT email, MIN(created_at) AS first_at FROM sales GROUP BY email)
      SELECT COUNT(*)::int AS customers,
             COUNT(*) FILTER (WHERE f.first_at >= ${from})::int AS "newCustomers",
             COUNT(*) FILTER (WHERE i.n >= 2)::int AS repeat
      FROM inside i JOIN firsts f USING (email)`
    return r ?? { customers: 0, newCustomers: 0, repeat: 0 }
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

/** part / whole as a % with one decimal (0 when there is nothing to divide). */
const percent = (part: number, whole: number) =>
  whole === 0 ? 0 : Math.round((part / whole) * 1000) / 10

/**
 * Days → chart points. Week = 7-day blocks starting on the period's first day
 * (so every block is a full week except maybe the last — no Saturday-vs-Monday
 * question). Month = calendar months (the first and last may be partial).
 */
export function groupDays(
  days: { date: string; revenue: string; orders: number }[],
  by: 'day' | 'week' | 'month',
): RevenuePoint[] {
  const points: (RevenuePoint & { sum: Prisma.Decimal })[] = []
  days.forEach((d, i) => {
    const key = by === 'day' ? i : by === 'week' ? Math.floor(i / 7) : d.date.slice(0, 7)
    let p = points.at(-1)
    const same = p && (by === 'month' ? p.start.slice(0, 7) === key : points.length - 1 === key)
    if (!p || !same) {
      p = { start: d.date, end: d.date, revenue: '0', orders: 0, sum: new Prisma.Decimal(0) }
      points.push(p)
    }
    p.end = d.date
    p.orders += d.orders
    p.sum = p.sum.plus(d.revenue)
  })
  return points.map(({ sum, ...p }) => ({ ...p, revenue: sum.toString() }))
}
