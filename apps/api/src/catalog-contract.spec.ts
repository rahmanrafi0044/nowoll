// CONTRACT TEST (types only): the storefront relies on the shapes in
// @nowoll/types/catalog. If an API response type changes without updating
// those shapes, this file stops compiling and `pnpm typecheck` fails —
// long before a customer sees a broken page.
import type {
  MarketingStatusView,
  MetaEventLogView,
  TestEventResultView,
  AccountOrderDetailView,
  AdminStaffPage as AdminStaffPageView,
  AdminShippingZone as AdminShippingZoneView,
  AdminArchivedCategory as AdminArchivedCategoryView,
  AdminCategoryNode as AdminCategoryNodeView,
  AdminPageDetail as AdminPageDetailView,
  AdminPageRow as AdminPageRowView,
  PageLinkView,
  PublicPageView,
  AdminReturnView,
  MyReturnView,
  ReturnEligibilityView,
  AdminReviewView,
  MyReviewView,
  ProductReviewsView,
  AccountOrderSummaryView,
  AccountView,
  CategoryDetail,
  CartQuoteView,
  CheckoutQuoteView,
  OrderPlacedView,
  OrderReceiptView,
  OrderTrackingView,
  PaymentInitView,
  PaymentStatusView,
  ShippingRateView,
  CategoryNode,
  DiscountPreviewView,
  ProductCardView,
  ProductDetailView,
  ProductFacetsView,
  ProductVariantView,
  SavedAddressView,
  Serialized,
  WishlistEntryView,
} from '@nowoll/types'
import { expectTypeOf } from 'vitest'
import type { AdminPageDetail, AdminPageRow, PageLink, PublicPage } from './pages/pages.service.js'
import type { SavedAddress } from './addresses/addresses.service.js'
import type { AccountProfile } from './auth/auth.service.js'
import type {
  AdminArchivedCategory,
  AdminCategoryNode,
  PublicCategoryDetail,
  PublicCategoryNode,
} from './categories/categories.service.js'
import type { DiscountPreview } from './discounts/discounts.service.js'
import type { CheckoutQuote } from './checkout/checkout.service.js'
import type {
  AccountOrderDetail,
  AccountOrderSummary,
  OrderReceipt,
  OrderTracking,
} from './orders/order-lookup.service.js'
import type { PlacedOrder } from './orders/orders.service.js'
import type { PaymentsService, PaymentStatusSummary } from './payments/payments.service.js'
import type { CartQuote } from './pricing/cart-pricing.js'
import type { AdminReturn, MyReturn, ReturnEligibility } from './returns/returns.service.js'
import type { AdminReview, MyReview, ProductReviews } from './reviews/reviews.service.js'
import type { AdminShippingZone, ShippingRate } from './shipping/shipping.service.js'
import type { AdminStaffPage } from './staff/staff.service.js'
import type { MarketingService } from './marketing/marketing.service.js'
import type { WishlistEntry } from './wishlist/wishlist.service.js'
import type { PublicVariant } from './products/product-view.js'
import type { ProductCard, ProductDetail, ProductFacets } from './products/products.service.js'

describe('API ↔ storefront contract', () => {
  it('categories', () => {
    expectTypeOf<Serialized<PublicCategoryNode>>().toEqualTypeOf<CategoryNode>()
    expectTypeOf<Serialized<PublicCategoryDetail>>().toEqualTypeOf<CategoryDetail>()
  })

  it('products', () => {
    expectTypeOf<Serialized<ProductCard>>().toEqualTypeOf<ProductCardView>()
    expectTypeOf<Serialized<ProductDetail>>().toEqualTypeOf<ProductDetailView>()
    expectTypeOf<Serialized<PublicVariant>>().toEqualTypeOf<ProductVariantView>()
    expectTypeOf<Serialized<ProductFacets>>().toEqualTypeOf<ProductFacetsView>()
  })

  it('discounts', () => {
    expectTypeOf<Serialized<DiscountPreview>>().toEqualTypeOf<DiscountPreviewView>()
  })

  it('cart', () => {
    expectTypeOf<Serialized<CartQuote>>().toEqualTypeOf<CartQuoteView>()
  })

  it('checkout', () => {
    expectTypeOf<Serialized<ShippingRate>>().toEqualTypeOf<ShippingRateView>()
    expectTypeOf<Serialized<CheckoutQuote>>().toEqualTypeOf<CheckoutQuoteView>()
  })

  it('orders', () => {
    expectTypeOf<Serialized<PlacedOrder>>().toEqualTypeOf<OrderPlacedView>()
    expectTypeOf<Serialized<OrderReceipt>>().toEqualTypeOf<OrderReceiptView>()
    expectTypeOf<Serialized<OrderTracking>>().toEqualTypeOf<OrderTrackingView>()
  })

  it('accounts', () => {
    expectTypeOf<Serialized<AccountProfile>>().toEqualTypeOf<AccountView>()
    expectTypeOf<Serialized<AccountOrderSummary>>().toEqualTypeOf<AccountOrderSummaryView>()
    expectTypeOf<Serialized<AccountOrderDetail>>().toEqualTypeOf<AccountOrderDetailView>()
    expectTypeOf<Serialized<SavedAddress>>().toEqualTypeOf<SavedAddressView>()
    expectTypeOf<Serialized<WishlistEntry>>().toEqualTypeOf<WishlistEntryView>()
  })

  it('reviews', () => {
    expectTypeOf<Serialized<ProductReviews>>().toEqualTypeOf<ProductReviewsView>()
    expectTypeOf<Serialized<MyReview>>().toEqualTypeOf<MyReviewView>()
    expectTypeOf<Serialized<AdminReview>>().toEqualTypeOf<AdminReviewView>()
  })

  it('returns', () => {
    expectTypeOf<Serialized<MyReturn>>().toEqualTypeOf<MyReturnView>()
    expectTypeOf<Serialized<ReturnEligibility>>().toEqualTypeOf<ReturnEligibilityView>()
    expectTypeOf<Serialized<AdminReturn>>().toEqualTypeOf<AdminReturnView>()
  })

  it('payments', () => {
    type Init = Awaited<ReturnType<PaymentsService['init']>>
    expectTypeOf<Serialized<Init>>().toEqualTypeOf<PaymentInitView>()
    expectTypeOf<Serialized<PaymentStatusSummary>>().toEqualTypeOf<PaymentStatusView>()
  })

  it('pages', () => {
    expectTypeOf<Serialized<PageLink>>().toEqualTypeOf<PageLinkView>()
    expectTypeOf<Serialized<PublicPage>>().toEqualTypeOf<PublicPageView>()
    expectTypeOf<Serialized<AdminPageRow>>().toEqualTypeOf<AdminPageRowView>()
    expectTypeOf<Serialized<AdminPageDetail>>().toEqualTypeOf<AdminPageDetailView>()
  })

  it('admin categories', () => {
    expectTypeOf<Serialized<AdminCategoryNode>>().toEqualTypeOf<AdminCategoryNodeView>()
    expectTypeOf<Serialized<AdminArchivedCategory>>().toEqualTypeOf<AdminArchivedCategoryView>()
  })

  it('admin shipping', () => {
    expectTypeOf<Serialized<AdminShippingZone>>().toEqualTypeOf<AdminShippingZoneView>()
  })

  it('admin staff', () => {
    expectTypeOf<Serialized<AdminStaffPage>>().toEqualTypeOf<AdminStaffPageView>()
    // Admin → Marketing (step 39b)
    type M = MarketingService
    expectTypeOf<
      Serialized<Awaited<ReturnType<M['status']>>>
    >().toEqualTypeOf<MarketingStatusView>()
    expectTypeOf<
      Serialized<Awaited<ReturnType<M['log']>>[number]>
    >().toEqualTypeOf<MetaEventLogView>()
    expectTypeOf<
      Serialized<Awaited<ReturnType<M['sendTest']>>>
    >().toEqualTypeOf<TestEventResultView>()
  })
})
