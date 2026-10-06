// ============================================================================
// Admin product management (step 30). Unlike the shop's product views, these
// include drafts and archived products, exact stock, and admin-only fields.
// ============================================================================
import type { Paginated } from './api.js'
import type { Money } from './catalog.js'

export type AdminProductStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED'

/** One row of the admin product list. */
export interface AdminProductRow {
  id: string
  name: string
  slug: string
  status: AdminProductStatus
  isFeatured: boolean
  category: { id: string; name: string }
  basePrice: Money
  compareAtPrice: Money | null
  /** The first photo (null = none yet). */
  image: { url: string; altText: string } | null
  imageCount: number
  /** Active variants only. */
  variantCount: number
  /** Units in stock across the active variants. */
  totalStock: number
  /** Active variants at or below their low-stock limit. */
  lowStockVariants: number
  /** Can it go live? (Needs at least one active variant AND one image.) */
  publishable: boolean
  updatedAt: string
}

export type AdminProductList = Paginated<AdminProductRow>

export const BULK_PRODUCT_ACTIONS = [
  'publish', // → ACTIVE (only products with a variant and an image)
  'unpublish', // → DRAFT (hidden from the shop)
  'feature',
  'unfeature',
  'archive', // soft delete — hidden everywhere, kept for order history
] as const
export type BulkProductAction = (typeof BULK_PRODUCT_ACTIONS)[number]

/** What happened to each product in a bulk action — each one is tried on its own. */
export interface BulkProductResult {
  action: BulkProductAction
  succeeded: string[]
  failed: { id: string; name: string | null; reason: string }[]
}
