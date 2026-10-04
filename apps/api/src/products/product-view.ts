// ============================================================================
// How products look to CUSTOMERS. Pure functions that turn database rows into
// response objects — only the fields the storefront needs, never internal ones
// (exact stock, cost-related fields, deletedAt, …).
// ============================================================================
import type { Prisma } from '@nowoll/database'

type Decimal = Prisma.Decimal

export interface VariantRow {
  id: string
  sku: string
  size: string
  color: string
  colorHex: string | null
  price: Decimal | null
  compareAtPrice: Decimal | null
  stock: number
  sortOrder: number
}

export interface ImageRow {
  id: string
  url: string
  altText: string
  variantId: string | null
  sortOrder: number
}

export interface PublicVariant {
  id: string
  sku: string
  size: string
  color: string
  colorHex: string | null
  price: Decimal // what the customer pays for THIS size/color
  compareAtPrice: Decimal | null
  inStock: boolean // exact stock stays private (decision #5)
}

export interface PublicImage {
  id: string
  url: string
  altText: string
  variantId: string | null
}

/** A variant's real price: its own price if set, otherwise the product's base price. */
export function toPublicVariant(
  v: VariantRow,
  product: { basePrice: Decimal; compareAtPrice: Decimal | null },
): PublicVariant {
  const hasOwnPrice = v.price !== null
  return {
    id: v.id,
    sku: v.sku,
    size: v.size,
    color: v.color,
    colorHex: v.colorHex,
    price: v.price ?? product.basePrice,
    // A variant with its own price shows its own "was" price; otherwise the product's.
    compareAtPrice: hasOwnPrice ? v.compareAtPrice : product.compareAtPrice,
    inStock: v.stock > 0,
  }
}

export const toPublicImage = (i: ImageRow): PublicImage => ({
  id: i.id,
  url: i.url,
  altText: i.altText,
  variantId: i.variantId,
})

/** Distinct colors in display order — for the swatches on a product card. */
export function distinctColors(variants: Pick<VariantRow, 'color' | 'colorHex'>[]) {
  const seen = new Map<string, string | null>()
  for (const v of variants) if (!seen.has(v.color)) seen.set(v.color, v.colorHex)
  return [...seen].map(([color, colorHex]) => ({ color, colorHex }))
}

/** Distinct sizes in display order. */
export const distinctSizes = (variants: Pick<VariantRow, 'size'>[]) => [
  ...new Set(variants.map((v) => v.size)),
]
