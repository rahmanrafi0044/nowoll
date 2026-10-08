// ============================================================================
// Inventory in the admin panel (step 33; the API is from step 11). Every stock
// change is logged with a reason; manual ones also with a note and who did it.
// ============================================================================
import type { Paginated } from './api.js'

/** One variant's stock. */
export interface InventoryRow {
  variantId: string
  sku: string
  size: string
  color: string
  stock: number
  /** The variant's own low-stock limit, or the store-wide setting. */
  threshold: number
  usesStoreThreshold: boolean
  isLow: boolean
  isActive: boolean
  product: { id: string; name: string; slug: string; status: string }
  category: { name: string; slug: string }
}

export type InventoryList = Paginated<InventoryRow>

/** GET /inventory/low-stock — live products' active variants at or below their limit. */
export interface LowStockList {
  items: InventoryRow[]
  total: number
  /** The store-wide limit (variants may have their own). */
  threshold: number
}

/** PATCH /inventory/:variantId/adjust — what the change did. */
export interface StockAdjustResult {
  variantId: string
  before: number
  after: number
  change: number
  /** null when nothing changed (e.g. "set to 7" when it already was 7). */
  logId: string | null
}

export type InventoryReason =
  | 'INITIAL_STOCK'
  | 'ORDER_PLACED'
  | 'ORDER_CANCELLED'
  | 'RETURN_RESTOCKED'
  | 'MANUAL_ADJUSTMENT'
  | 'CSV_IMPORT'

/** One line of a variant's stock history. */
export interface InventoryLogEntry {
  id: string
  change: number
  stockAfter: number
  reason: InventoryReason
  note: string | null
  /** The order behind it (sold, cancelled, returned) — with its number for display. */
  order: { id: string; number: string } | null
  /** The staff member, for manual changes (null = the system: orders, imports before step 33). */
  actor: { id: string; name: string } | null
  createdAt: string
}

export type InventoryHistory = Paginated<InventoryLogEntry>
