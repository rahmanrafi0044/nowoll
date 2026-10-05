import type { ProductImageView, ProductVariantView } from '@nowoll/types'

// ============================================================================
// Size/color selection for a product (quick view + product page).
// The customer picks a COLOR first, then a SIZE; together they identify one
// variant (one SKU). Pure functions — easy to test, no React.
// ============================================================================

export interface ColorOption {
  color: string
  colorHex: string | null
  inStock: boolean // at least one size of this color is in stock
}

export interface SizeOption {
  size: string
  variant: ProductVariantView
  inStock: boolean
}

/** Colors in display order (first appearance), with whether any size is available. */
export function colorOptions(variants: ProductVariantView[]): ColorOption[] {
  const map = new Map<string, ColorOption>()
  for (const v of variants) {
    const existing = map.get(v.color)
    if (existing) existing.inStock ||= v.inStock
    else map.set(v.color, { color: v.color, colorHex: v.colorHex, inStock: v.inStock })
  }
  return [...map.values()]
}

/** Sizes available in one color, in display order. */
export function sizeOptions(variants: ProductVariantView[], color: string): SizeOption[] {
  return variants
    .filter((v) => v.color === color)
    .map((v) => ({ size: v.size, variant: v, inStock: v.inStock }))
}

export function findVariant(variants: ProductVariantView[], color: string, size: string | null) {
  return size === null ? undefined : variants.find((v) => v.color === color && v.size === size)
}

/**
 * What's selected when the page opens: the first color that has stock (so
 * customers don't land on a sold-out color). The SIZE is left unselected on
 * purpose — guessing a size leads to wrong orders — unless there's only one.
 */
export function initialSelection(variants: ProductVariantView[]): {
  color: string | null
  size: string | null
} {
  const colors = colorOptions(variants)
  const color = (colors.find((c) => c.inStock) ?? colors[0])?.color ?? null
  if (color === null) return { color: null, size: null }
  const sizes = sizeOptions(variants, color)
  return { color, size: sizes.length === 1 ? sizes[0]!.size : null }
}

/**
 * Photos to show for a color: photos linked to a variant of that color first,
 * then general photos (not linked to any variant). Falls back to all photos.
 */
export function imagesForColor(
  images: ProductImageView[],
  variants: ProductVariantView[],
  color: string | null,
): ProductImageView[] {
  if (color === null) return images
  const colorOf = new Map(variants.map((v) => [v.id, v.color]))
  const own = images.filter((i) => i.variantId !== null && colorOf.get(i.variantId) === color)
  const general = images.filter((i) => i.variantId === null)
  const result = [...own, ...general]
  return result.length > 0 ? result : images
}
