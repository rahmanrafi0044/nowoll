// ============================================================================
// Admin analytics (step 29b: the dashboard; step 40 adds more).
// "Sales" = orders that are CONFIRMED or further (processing, shipped,
// delivered), counted on the day they were placed, in Bangladesh time.
// Unconfirmed (PENDING), cancelled and returned orders are not sales.
// Dates are YYYY-MM-DD shop calendar days.
// ============================================================================
import type { Money } from './catalog.js'

export interface SalesTotals {
  revenue: Money
  orders: number
}

export interface AnalyticsSummary {
  today: SalesTotals & { date: string }
  last7Days: SalesTotals & { from: string; to: string; averageOrderValue: Money }
  /** The 7 days before those — for "▲ 12% vs the week before". */
  previous7Days: SalesTotals
  newCustomers: { last7Days: number; previous7Days: number }
  /** Work waiting for someone right now. */
  needsAttention: {
    codToConfirm: number // cash-on-delivery orders waiting for the confirmation call
    toShip: number // confirmed or being packed
    paymentsToReview: number // SSLCommerz couldn't be asked — a human must check
    returnRequests: number // waiting for approve / reject
  }
}

export interface RevenueDay extends SalesTotals {
  date: string
}

/** One point of the revenue chart (step 40): a day, a 7-day block or a calendar month. */
export interface RevenuePoint extends SalesTotals {
  /** First and last shop day the point covers (YYYY-MM-DD). */
  start: string
  end: string
}

export interface RevenueSeries {
  from: string
  to: string
  /** Every day in the range, oldest first — days without sales included (zero). */
  days: RevenueDay[]
  /** The chart's points: by day up to 92 days, else by 7-day blocks (or as asked). */
  groupBy: 'day' | 'week' | 'month'
  points: RevenuePoint[]
  total: Money
  orders: number
  /** The same number of days just before — for "▲ 12%". */
  previous: SalesTotals & { from: string; to: string }
}

export interface TopProduct {
  /** null when the product has since been deleted (name = what the order said). */
  productId: string | null
  name: string
  slug: string | null
  unitsSold: number
  /** Line totals — before order-level discounts. */
  revenue: Money
}

export interface TopProducts {
  from: string
  to: string
  items: TopProduct[]
}

// ── Step 40: the analytics page ───────────────────────────────────────────

export interface TopCategory {
  /** null = products deleted since (their category is no longer known). */
  categoryId: string | null
  name: string
  /** "Men > Shirts" (just the name for a top-level category). */
  path: string
  unitsSold: number
  /** Line totals — before order-level discounts. */
  revenue: Money
}

export interface TopCategories {
  from: string
  to: string
  /** 'category' = each category; 'top' = rolled up to the top level ("Men"). */
  level: 'category' | 'top'
  items: TopCategory[]
  /** All line totals in the period (also the categories not listed). */
  total: Money
  previousTotal: Money
}

export interface TopCustomer {
  /** Lower-case email: guests and account holders alike are known by it. */
  email: string
  /** The name on their latest order. */
  name: string
  /** Their account, if any of these orders was placed signed in. */
  userId: string | null
  orders: number
  spent: Money
}

export interface CustomersReport {
  from: string
  to: string
  /** Different customers (emails) who bought in the period. */
  customers: number
  /** …whose first ever purchase was in the period. */
  newCustomers: number
  /** …who had bought before the period. */
  returningCustomers: number
  /** Customers with 2+ orders in the period, as a % of customers (1 decimal). */
  repeatRate: number
  previous: { customers: number; newCustomers: number }
  topCustomers: TopCustomer[]
}

export interface OrdersReport {
  from: string
  to: string
  /** Every order PLACED in the period, whatever happened to it since. */
  placed: number
  /** Where those orders are now. */
  outcomes: {
    sale: number // confirmed, processing, shipped or delivered
    delivered: number // (part of sale)
    pending: number // not confirmed yet (COD call due, or unpaid online)
    cancelled: number
    returned: number
  }
  /** Cancelled as a % of placed (1 decimal). */
  cancellationRate: number
  previous: { placed: number; cancellationRate: number }
  /** Sales only, split by how they pay and where they go. */
  byPaymentMethod: { method: 'COD' | 'SSLCOMMERZ'; orders: number; revenue: Money }[]
  byZone: { zone: string; orders: number; revenue: Money }[]
}
