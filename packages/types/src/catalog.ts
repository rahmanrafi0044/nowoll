// ============================================================================
// Public catalog data AS THE STOREFRONT RECEIVES IT (JSON over HTTP).
// Money is a string ("1490" / "1490.5") because the API sends exact decimals,
// never floats. The API has a type-level test that fails if its real
// responses ever drift from these shapes (apps/api/src/catalog-contract.spec.ts).
// ============================================================================

/** A decimal amount in BDT, as a string, e.g. "1490" or "1499.5". */
export type Money = string

export interface CategorySummary {
  id: string
  name: string
  slug: string
  description: string | null
  imageUrl: string | null
  imageAlt: string | null
  seoTitle: string | null
  seoDescription: string | null
}

export interface CategoryNode extends CategorySummary {
  children: CategoryNode[]
}

export interface BreadcrumbItem {
  id: string
  name: string
  slug: string
}

export interface CategoryDetail extends CategorySummary {
  sizeGuide: string | null
  breadcrumb: BreadcrumbItem[]
  children: CategorySummary[]
}

export interface ProductImageView {
  id: string
  url: string
  altText: string
  variantId: string | null
}

export interface ProductVariantView {
  id: string
  sku: string
  size: string
  color: string
  colorHex: string | null
  price: Money
  compareAtPrice: Money | null
  inStock: boolean
}

export interface ProductCardView {
  id: string
  name: string
  slug: string
  shortDescription: string | null
  basePrice: Money
  compareAtPrice: Money | null
  isFeatured: boolean
  category: { name: string; slug: string }
  image: ProductImageView | null
  colors: { color: string; colorHex: string | null }[]
  sizes: string[]
  inStock: boolean
}

export interface ProductDetailView extends Omit<ProductCardView, 'image' | 'colors' | 'sizes'> {
  description: string | null
  tags: string[]
  seoTitle: string | null
  seoDescription: string | null
  breadcrumb: BreadcrumbItem[]
  images: ProductImageView[]
  variants: ProductVariantView[]
}

export interface ContentBlockView<T> {
  key: string
  data: T
}

/** Filter options for a listing page (GET /products/facets). */
export interface ProductFacetsView {
  sizes: string[]
  colors: { color: string; colorHex: string | null }[]
  price: { min: Money; max: Money } | null
}

/** POST /discounts/validate — what a code would take off the bag (a preview). */
export interface DiscountPreviewView {
  code: string
  type: 'PERCENTAGE' | 'FIXED_AMOUNT'
  value: Money
  subtotal: Money
  discountAmount: Money
  subtotalAfterDiscount: Money
}
