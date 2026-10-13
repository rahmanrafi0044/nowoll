import type {
  AnalyticsSummary,
  CustomersReport,
  InventoryRow,
  LowStockList,
  OrdersReport,
  RevenueSeries,
  TopCategories,
  TopProducts,
} from '@nowoll/types'
import { periodQuery } from '@/lib/analytics-period'
import { call } from '@/lib/api'

// The dashboard's data (step 29b) — see apps/api/src/analytics and inventory.
export const fetchSummary = () => call<AnalyticsSummary>('GET', '/analytics/summary')

export const fetchRevenue = (days: number) =>
  call<RevenueSeries>('GET', `/analytics/revenue?days=${days}`)

export const fetchTopProducts = (days: number, limit: number) =>
  call<TopProducts>('GET', `/analytics/top-products?days=${days}&limit=${limit}`)

/** One row of GET /inventory/low-stock — the shared inventory row (step 33). */
export type LowStockRow = InventoryRow

export const fetchLowStock = () => call<LowStockList>('GET', '/inventory/low-stock')

// ── The Analytics page (step 41) — any period; see docs/analytics.md ─────────

type Dates = { from: string; to: string }

export const fetchRevenueFor = (p: Dates, groupBy?: 'day' | 'week' | 'month') =>
  call<RevenueSeries>(
    'GET',
    `/analytics/revenue?${periodQuery(p)}${groupBy ? `&groupBy=${groupBy}` : ''}`,
  )

export const fetchTopProductsFor = (p: Dates, limit = 10) =>
  call<TopProducts>('GET', `/analytics/top-products?${periodQuery(p)}&limit=${limit}`)

export const fetchTopCategoriesFor = (p: Dates, level: 'category' | 'top', limit = 10) =>
  call<TopCategories>(
    'GET',
    `/analytics/top-categories?${periodQuery(p)}&level=${level}&limit=${limit}`,
  )

export const fetchCustomersFor = (p: Dates, limit = 10) =>
  call<CustomersReport>('GET', `/analytics/customers?${periodQuery(p)}&limit=${limit}`)

export const fetchOrdersFor = (p: Dates) =>
  call<OrdersReport>('GET', `/analytics/orders?${periodQuery(p)}`)
