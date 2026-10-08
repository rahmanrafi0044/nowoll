import type {
  AnalyticsSummary,
  InventoryRow,
  LowStockList,
  RevenueSeries,
  TopProducts,
} from '@nowoll/types'
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
