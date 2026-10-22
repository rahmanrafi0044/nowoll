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
  'move', // → another category (needs categoryId) — e.g. before archiving a category
] as const
export type BulkProductAction = (typeof BULK_PRODUCT_ACTIONS)[number]

/** What happened to each product in a bulk action — each one is tried on its own. */
export interface BulkProductResult {
  action: BulkProductAction
  succeeded: string[]
  failed: { id: string; name: string | null; reason: string }[]
}

/**
 * What a CSV import did — or, for a dry run, WOULD do (nothing is saved).
 * Problems come back as an error instead, with one line per problem
 * (row numbers included) in `details`.
 */
export interface ProductImportSummary {
  dryRun: boolean
  products: { created: number; updated: number; unchanged: number }
  variants: { created: number; updated: number; unchanged: number }
  stockChanges: number
}

/** One variant on the admin edit page — inactive ones included (deleted ones never). */
export interface AdminVariant {
  id: string
  sku: string
  size: string
  color: string
  colorHex: string | null
  /** null = sells at the product's base price. */
  price: Money | null
  compareAtPrice: Money | null
  /** Exact stock. Changed only through the inventory page (every change logged). */
  stock: number
  /** null = the store-wide low-stock setting. */
  lowStockThreshold: number | null
  weightGrams: number | null
  isActive: boolean
  sortOrder: number
}

export interface AdminImage {
  id: string
  url: string
  altText: string
  variantId: string | null
  /** 0 = the main photo. */
  sortOrder: number
}

/** GET /admin/products/:id — everything the edit page needs, in one answer. */
export interface AdminProductDetail {
  id: string
  name: string
  slug: string
  status: AdminProductStatus
  isFeatured: boolean
  category: { id: string; name: string }
  basePrice: Money
  compareAtPrice: Money | null
  shortDescription: string | null
  description: string | null
  tags: string[]
  seoTitle: string | null
  seoDescription: string | null
  /** 38f: shown on the card and the product page. */
  fabric: string | null
  care: string | null
  fitNote: string | null
  readyToShip: boolean
  /** 38f: its own size chart (null = the category's, if any). */
  sizeChartId: string | null
  variants: AdminVariant[]
  images: AdminImage[]
  /** What it still needs before it can go live (empty = ready). */
  missingToPublish: ('variant' | 'image')[]
  createdAt: string
  updatedAt: string
}
