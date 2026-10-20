import type { EditorialTileView } from './catalog.js'
// ============================================================================
// Categories in the admin panel (step 36b). Unlike the shop's /categories
// (visible ones only), the admin sees hidden categories too, with counts.
// ============================================================================

export interface AdminCategoryNode {
  id: string
  name: string
  slug: string
  parentId: string | null
  description: string | null
  imageUrl: string | null
  imageAlt: string | null
  /** Markdown (tables!) — shown on every product page in this category. */
  sizeGuide: string | null
  editorial: EditorialTileView[]
  seoTitle: string | null
  seoDescription: string | null
  /** Its own switch. Customers see it only when it AND every parent are on. */
  isActive: boolean
  sortOrder: number
  /** Products directly in this category (not archived). */
  productCount: number
  children: AdminCategoryNode[]
}

/** An archived category (soft-deleted) — can be restored. */
export interface AdminArchivedCategory {
  id: string
  name: string
  slug: string
  archivedAt: string
}
