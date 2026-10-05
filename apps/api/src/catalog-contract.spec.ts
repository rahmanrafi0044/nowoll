// CONTRACT TEST (types only): the storefront relies on the shapes in
// @nowoll/types/catalog. If an API response type changes without updating
// those shapes, this file stops compiling and `pnpm typecheck` fails —
// long before a customer sees a broken page.
import type {
  CategoryDetail,
  CartQuoteView,
  CategoryNode,
  DiscountPreviewView,
  ProductCardView,
  ProductDetailView,
  ProductFacetsView,
  ProductVariantView,
  Serialized,
} from '@nowoll/types'
import { expectTypeOf } from 'vitest'
import type { PublicCategoryDetail, PublicCategoryNode } from './categories/categories.service.js'
import type { DiscountPreview } from './discounts/discounts.service.js'
import type { CartQuote } from './pricing/cart-pricing.js'
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
})
