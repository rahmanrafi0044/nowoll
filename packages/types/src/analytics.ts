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

export interface RevenueSeries {
  /** Every day in the range, oldest first — days without sales included (zero). */
  days: RevenueDay[]
  total: Money
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
