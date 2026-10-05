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

/** POST /cart/price — today's price and availability per line. */
export interface CartQuoteLineView {
  variantId: string
  quantity: number
  status: 'ok' | 'unavailable' | 'insufficient_stock'
  productName?: string
  productSlug?: string
  variantLabel?: string
  sku?: string
  imageUrl?: string | null
  unitPrice?: Money
  lineTotal?: Money
}

export interface CartQuoteView {
  lines: CartQuoteLineView[]
  subtotal: Money
  canCheckout: boolean
}

/** GET /shipping/rates and the shipping part of a checkout quote. */
export interface ShippingRateView {
  id: string
  code: string
  name: string
  fee: Money
  freeShippingThreshold: Money | null
  estimatedDaysMin: number | null
  estimatedDaysMax: number | null
  districts: string[]
  isDefault: boolean
}

/** POST /checkout/quote — every number on the checkout summary. */
export interface CheckoutQuoteView {
  lines: {
    variantId: string
    productId: string
    productName: string
    variantLabel: string
    sku: string
    unitPrice: Money
    quantity: number
    lineTotal: Money
  }[]
  totals: {
    subtotal: Money
    discount: Money
    afterDiscount: Money
    shippingFee: Money
    freeShipping: boolean
    vatRate: Money
    vatAmount: Money
    total: Money
  }
  discount: { code: string; amount: Money } | null
  discountProblem: DiscountProblemView | null
  shipping: ShippingRateView | null
}

/** Why a discount code can't be used (same codes as the API's 422 errors). */
export type DiscountProblemView =
  | { code: 'DISCOUNT_NOT_VALID'; message: string }
  | { code: 'DISCOUNT_EXPIRED'; message: string }
  | { code: 'DISCOUNT_USED_UP'; message: string }
  | { code: 'DISCOUNT_MIN_ORDER'; message: string; shortBy: Money }
  | { code: 'DISCOUNT_CUSTOMER_LIMIT'; message: string }
