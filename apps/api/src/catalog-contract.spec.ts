// CONTRACT TEST (types only): the storefront relies on the shapes in
// @nowoll/types/catalog. If an API response type changes without updating
// those shapes, this file stops compiling and `pnpm typecheck` fails —
// long before a customer sees a broken page.
import type {
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
  Serialized,
} from '@nowoll/types'
import { expectTypeOf } from 'vitest'
import type { AccountProfile } from './auth/auth.service.js'
import type { PublicCategoryDetail, PublicCategoryNode } from './categories/categories.service.js'
import type { DiscountPreview } from './discounts/discounts.service.js'
import type { CheckoutQuote } from './checkout/checkout.service.js'
import type { OrderReceipt, OrderTracking } from './orders/order-lookup.service.js'
import type { PlacedOrder } from './orders/orders.service.js'
import type { PaymentsService, PaymentStatusSummary } from './payments/payments.service.js'
import type { CartQuote } from './pricing/cart-pricing.js'
import type { ShippingRate } from './shipping/shipping.service.js'
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
  })

  it('payments', () => {
    type Init = Awaited<ReturnType<PaymentsService['init']>>
    expectTypeOf<Serialized<Init>>().toEqualTypeOf<PaymentInitView>()
    expectTypeOf<Serialized<PaymentStatusSummary>>().toEqualTypeOf<PaymentStatusView>()
  })
})
