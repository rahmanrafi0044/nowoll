export * from './api.js'
export * from './admin-categories.js'
export * from './admin-customers.js'
export * from './admin-discounts.js'
export * from './admin-inventory.js'
export * from './admin-orders.js'
export * from './admin-products.js'
export * from './analytics.js'
export * from './catalog.js'
export * from './pages.js'
export * from './serialized.js'

// Database model types (Product, Order, …) — TYPE-ONLY, so importing them
// never pulls the database client into a browser bundle.
export type {
  Address,
  BlogPost,
  Category,
  ContentBlock,
  DiscountCode,
  Order,
  OrderItem,
  OrderStatusHistory,
  Page,
  Payment,
  Product,
  ProductImage,
  ProductVariant,
  Review,
  ReturnRequest,
  Setting,
  ShippingZone,
  User,
  WishlistItem,
} from '@nowoll/database'

// Enums are real values (usable in dropdowns, comparisons) as well as types.
// They come from a tiny generated file with no database code in it.
export * from '@nowoll/database/enums'
