import type { AnalyticsSummary, RevenueSeries, TopProducts } from '@nowoll/types'
import { call } from '@/lib/api'

// The dashboard's data (step 29b) — see apps/api/src/analytics and inventory.
export const fetchSummary = () => call<AnalyticsSummary>('GET', '/analytics/summary')

export const fetchRevenue = (days: number) =>
  call<RevenueSeries>('GET', `/analytics/revenue?days=${days}`)

export const fetchTopProducts = (days: number, limit: number) =>
  call<TopProducts>('GET', `/analytics/top-products?days=${days}&limit=${limit}`)

/** One row of GET /inventory/low-stock (apps/api/src/inventory/inventory.service.ts → InventoryRow). */
export interface LowStockRow {
  variantId: string
  sku: string
  size: string
  color: string
  stock: number
  threshold: number
  product: { id: string; name: string; slug: string }
}

export const fetchLowStock = () =>
  call<{ items: LowStockRow[]; total: number; threshold: number }>('GET', '/inventory/low-stock')
