// ============================================================================
// Public catalog data AS THE STOREFRONT RECEIVES IT (JSON over HTTP).
// Money is a string ("1490" / "1490.5") because the API sends exact decimals,
// never floats. The API has a type-level test that fails if its real
// responses ever drift from these shapes (apps/api/src/catalog-contract.spec.ts).
// ============================================================================

import type { Paginated } from './api.js'

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
    imageUrl: string | null
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
  /** Which payment methods this order may use, and the minimum order (step 38c). */
  payment: {
    options: {
      method: 'SSLCOMMERZ' | 'COD'
      title: string
      description: string
      available: boolean
      problem: {
        code: 'COD_OFF' | 'COD_LIMIT' | 'ONLINE_PAYMENT_UNAVAILABLE' | 'ONLINE_PAYMENT_AMOUNT'
        message: string
      } | null
    }[]
    /** null = no minimum; shortBy "0" = big enough. */
    minimumOrder: { amount: Money; shortBy: Money } | null
  }
}

/** Why a discount code can't be used (same codes as the API's 422 errors). */
export type DiscountProblemView =
  | { code: 'DISCOUNT_NOT_VALID'; message: string }
  | { code: 'DISCOUNT_EXPIRED'; message: string }
  | { code: 'DISCOUNT_USED_UP'; message: string }
  | { code: 'DISCOUNT_MIN_ORDER'; message: string; shortBy: Money }
  | { code: 'DISCOUNT_CUSTOMER_LIMIT'; message: string }

/** POST /orders — the result of placing an order. */
export interface OrderPlacedView {
  orderId: string
  orderNumber: number
  displayNumber: string // "NW-10001"
  status:
    'PENDING' | 'CONFIRMED' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED' | 'RETURNED'
  paymentMethod: 'SSLCOMMERZ' | 'COD'
  paymentStatus:
    'PENDING' | 'PAID' | 'FAILED' | 'CANCELLED' | 'UNDER_REVIEW' | 'REFUNDED' | 'PARTIALLY_REFUNDED'
  total: Money
  nextAction: 'NONE' | 'PAY'
}

/** POST /payment/sslcommerz/init — where to send the customer to pay. */
export interface PaymentInitView {
  redirectUrl: string
}

/** GET /payment/status/:orderId — what the thank-you / payment-failed pages show. */
export interface PaymentStatusView {
  orderId: string
  displayNumber: string // "NW-10001"
  status: OrderPlacedView['status']
  paymentMethod: OrderPlacedView['paymentMethod']
  paymentStatus: OrderPlacedView['paymentStatus']
  total: Money
  /** True while "Try paying again" can still work (unpaid and within the payment window). */
  canRetry: boolean
}

/** One line of a placed order (names and prices as they were when ordered). */
export interface OrderLineView {
  productId: string | null
  productName: string
  variantLabel: string
  imageUrl: string | null
  unitPrice: Money
  quantity: number
  lineTotal: Money
}

interface OrderBasicsView {
  displayNumber: string // "NW-10001"
  placedAt: string // ISO date
  status: OrderPlacedView['status']
  paymentMethod: OrderPlacedView['paymentMethod']
  paymentStatus: OrderPlacedView['paymentStatus']
  items: OrderLineView[]
  total: Money
  /** True while "Pay now" can still work (online, unpaid, within the payment window). */
  canPay: boolean
}

/** GET /orders/:id/receipt — the confirmation page (the random order id is the key). */
export interface OrderReceiptView extends OrderBasicsView {
  orderId: string
  customerName: string
  deliveryAddress: {
    addressLine1: string
    addressLine2: string | null
    area: string | null
    district: string
    division: string
    postalCode: string | null
  }
  deliveryZone: string
  totals: {
    subtotal: Money
    discount: Money
    discountCode: string | null
    shippingFee: Money
    vatRate: Money
    vatAmount: Money
    total: Money
  }
}

/** POST /orders/track — the public tracking page (no street address, by design). */
export interface OrderTrackingView extends OrderBasicsView {
  /** Only while "Pay now" can work. */
  payOrderId: string | null
  deliveryArea: { area: string | null; district: string; division: string }
  courierName: string | null
  trackingNumber: string | null
  /** When the order first reached each status, oldest first. */
  timeline: { status: OrderPlacedView['status']; at: string }[]
}

/** The signed-in customer (GET /auth/me, and the answer to login/register/reset). */
export interface AccountView {
  id: string
  email: string
  fullName: string | null
  phone: string | null
}

/** GET /orders/my — one row of "My orders". */
export interface AccountOrderSummaryView {
  displayNumber: string
  placedAt: string
  status: OrderPlacedView['status']
  paymentMethod: OrderPlacedView['paymentMethod']
  paymentStatus: OrderPlacedView['paymentStatus']
  total: Money
  itemCount: number
  imageUrls: string[]
}

/** GET /orders/my/:number — the receipt plus delivery progress. */
export interface AccountOrderDetailView extends OrderReceiptView {
  courierName: string | null
  trackingNumber: string | null
  timeline: { status: OrderPlacedView['status']; at: string }[]
}

/** /addresses — a saved delivery address. */
export interface SavedAddressView {
  id: string
  label: string | null
  fullName: string
  phone: string
  addressLine1: string
  addressLine2: string | null
  area: string | null
  district: string
  division: string
  postalCode: string | null
  isDefault: boolean
}

/** GET /wishlist — a saved size/colour with today's price and stock. */
export interface WishlistEntryView {
  variantId: string
  productId: string
  sku: string
  productName: string
  productSlug: string
  size: string
  color: string
  price: Money
  compareAtPrice: Money | null
  imageUrl: string | null
  inStock: boolean
  savedAt: string
}

export type ReviewStatusView = 'PENDING' | 'APPROVED' | 'REJECTED'

/** A published review (first name + last initial only). */
export interface PublicReviewView {
  id: string
  rating: number
  title: string | null
  body: string
  author: string
  createdAt: string
}

export interface RatingSummaryView {
  average: number | null
  count: number
  breakdown: Record<'1' | '2' | '3' | '4' | '5', number>
}

/** GET /reviews/product/:productId */
export interface ProductReviewsView extends Paginated<PublicReviewView> {
  summary: RatingSummaryView
}

/** GET /reviews/my, POST /reviews — the customer's own review and its status. */
export interface MyReviewView {
  id: string
  productId: string
  rating: number
  title: string | null
  body: string
  status: ReviewStatusView
  rejectionReason: string | null
  updatedAt: string
}

/** GET /reviews (admin) */
export interface AdminReviewView extends MyReviewView {
  product: { id: string; name: string; slug: string }
  author: { id: string; name: string | null; email: string }
  orderNumber: number
  createdAt: string
}

export type ReturnStatusView = 'REQUESTED' | 'APPROVED' | 'REJECTED' | 'RECEIVED' | 'REFUNDED'
export type ReturnReasonView =
  'WRONG_SIZE' | 'DAMAGED' | 'NOT_AS_DESCRIBED' | 'CHANGED_MIND' | 'OTHER'

export interface ReturnLineView {
  orderItemId: string
  productName: string
  variantLabel: string
  imageUrl: string | null
  quantity: number
  restock: boolean
}

/** GET /returns/my, POST /returns — a return as the customer sees it. */
export interface MyReturnView {
  id: string
  orderNumber: string
  status: ReturnStatusView
  reason: ReturnReasonView
  customerNote: string | null
  adminNote: string | null
  rejectionReason: string | null
  refundAmount: Money | null
  items: ReturnLineView[]
  createdAt: string
  approvedAt: string | null
  rejectedAt: string | null
  /** When the parcel came back (step 35; null before then, and for returns received before step 35). */
  receivedAt: string | null
}

/** One refund of a return, as the admin sees it (step 35). */
export interface AdminRefundView {
  id: string
  amount: Money
  /** PENDING: SSLCommerz hasn't confirmed yet (see `stage`). */
  status: 'PENDING' | 'PROCESSED' | 'FAILED'
  /** MANUAL: paid back by hand (bKash / cash). GATEWAY: through SSLCommerz. */
  method: 'GATEWAY' | 'MANUAL'
  /** A PENDING refund: SSLCommerz is PROCESSING it (re-checked every 15 min) or gave NO_ANSWER (check its panel, then resolve). */
  stage: 'PROCESSING' | 'NO_ANSWER' | null
  /** MANUAL: the bKash TrxID or "cash" note entered with it. */
  reference: string | null
  gatewayRefId: string | null
  /** Why it failed, or the note left when it was resolved by hand. */
  note: string | null
  processedAt: string | null
  createdAt: string
}

/** GET /returns/eligibility/:orderNumber */
export interface ReturnEligibilityView {
  canReturn: boolean
  reason: string | null
  windowClosesAt: string | null
  items: {
    orderItemId: string
    productName: string
    variantLabel: string
    imageUrl: string | null
    bought: number
    returnable: number
  }[]
}

/** GET /returns/:id (admin) */
export interface AdminReturnView extends MyReturnView {
  orderId: string
  customer: { id: string; name: string | null; email: string; phone: string }
  paymentMethod: string
  suggestedRefund: Money
  maxRefundable: Money
  refunds: AdminRefundView[]
}

/** GET /returns (admin) — oldest first: it's a queue. */
export type AdminReturnList = Paginated<AdminReturnView>
