import type {
  InventoryHistory,
  InventoryList,
  LowStockList,
  StockAdjustResult,
} from '@nowoll/types'
import { call } from '@/lib/api'

// Inventory in the admin panel (step 33) — apps/api/src/inventory (step 11).

export interface InventoryFilters {
  q?: string
  /** Category slug (that category only, not its subcategories). */
  category?: string
  /** Only sold-out variants. */
  stock?: 'out'
  sort?: 'stock_asc' | 'stock_desc' | 'name'
  page?: number
}

export function fetchInventory(filters: InventoryFilters) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(filters))
    if (value !== undefined && value !== '') params.set(key, String(value))
  return call<InventoryList>('GET', `/inventory?${params}`)
}

export const fetchLowStockList = () => call<LowStockList>('GET', '/inventory/low-stock')

/** Exactly one of `change` (+/−) or `setTo` (an exact count), always with a note. */
export const adjustStock = (
  variantId: string,
  body: ({ change: number } | { setTo: number }) & { note: string },
) => call<StockAdjustResult>('PATCH', `/inventory/${variantId}/adjust`, body)

export const fetchStockHistory = (variantId: string, page = 1) =>
  call<InventoryHistory>('GET', `/inventory/${variantId}/log?page=${page}&pageSize=50`)
