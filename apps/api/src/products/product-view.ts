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

// ── Design refresh (38f): badges and "From ৳…" ──────────────────────────────

export interface ProductBadges {
  /** Added within the last `badgeDays` days. */
  isNew: boolean
  /** A size came back in stock within the last `badgeDays` days (StockService sets it). */
  restocked: boolean
  /** The admin ticked "Ready to ship" (made and in the warehouse — no tailoring wait). */
  readyToShip: boolean
}

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * The badges a product card shows. `badgeDays` comes from Admin → Settings
 * (0 = no New/Restocked badges at all). A sold-out product is never shown as
 * "Restocked" — that would be a broken promise.
 */
export function productBadges(
  p: { createdAt: Date; restockedAt: Date | null; readyToShip: boolean },
  inStock: boolean,
  badgeDays: number,
  now = Date.now(),
): ProductBadges {
  const within = (d: Date | null) => !!d && badgeDays > 0 && now - d.getTime() < badgeDays * DAY_MS
  return {
    isNew: within(p.createdAt),
    restocked: inStock && within(p.restockedAt) && !within(p.createdAt), // "New" says it already
    readyToShip: p.readyToShip,
  }
}

/**
 * The lowest price when the sizes/colours don't all cost the same — the card
 * then says "From ৳2,450". null when every variant costs the same (or none).
 */
export function fromPrice(
  variants: Pick<VariantRow, 'price'>[],
  basePrice: Decimal,
): Decimal | null {
  if (variants.length === 0) return null
  const prices = variants.map((v) => v.price ?? basePrice)
  const min = prices.reduce((a, b) => (b.lessThan(a) ? b : a))
  return prices.some((p) => !p.equals(min)) ? min : null
}
