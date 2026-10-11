'use client'

import { addToCartEvent, newEventId } from '@nowoll/analytics'
import type { ProductDetailView } from '@nowoll/types'
import { Button } from '@nowoll/ui'
import { useEffect, useState } from 'react'
import { discountPercent, formatBdt } from '@/lib/format'
import { colorOptions, findVariant, sizeOptions } from '@/lib/variants'
import { useCartStore } from '@/stores/cart-store'
import { track } from '@/stores/tracking-store'
import { useUiStore } from '@/stores/ui-store'
import { WishlistButton } from './wishlist-button'

// A UI limit to catch typos ("100" instead of "1"), not a business rule —
// the real stock check happens at checkout (Phase 3).
const MAX_QTY = 10

interface Props {
  product: ProductDetailView
  color: string | null
  onColorChange: (color: string) => void
  initialSize?: string | null
  /** Product page only: a bar fixed to the bottom of phone screens with the Add button. */
  sticky?: boolean
  /** Shows a "Size guide" link next to the size picker. */
  sizeGuideHref?: string
}

export function ProductPurchase({
  product,
  color,
  onColorChange,
  initialSize = null,
  sticky = false,
  sizeGuideHref,
}: Props) {
  const [size, setSize] = useState<string | null>(initialSize)
  const [quantity, setQuantity] = useState(1)
  const [added, setAdded] = useState(false)
  const addItem = useCartStore((s) => s.addItem)
  const openCart = useUiStore((s) => s.openCart)

  const colors = colorOptions(product.variants)
  const sizes = color ? sizeOptions(product.variants, color) : []
  const variant = color ? findVariant(product.variants, color, size) : undefined

  // Picking a new color keeps the size only if that size exists (and is in stock) in the new color.
  function chooseColor(next: string) {
    onColorChange(next)
    const stillAvailable = sizeOptions(product.variants, next).some(
      (s) => s.size === size && s.inStock,
    )
    if (!stillAvailable)
      setSize(
        sizeOptions(product.variants, next).length === 1
          ? sizeOptions(product.variants, next)[0]!.size
          : null,
      )
  }

  useEffect(() => {
    if (!added) return
    const t = setTimeout(() => setAdded(false), 2500)
    return () => clearTimeout(t)
  }, [added])

  const price = variant?.price ?? product.basePrice
  const compareAt = variant ? variant.compareAtPrice : product.compareAtPrice
  const discount = discountPercent(price, compareAt)
  const anyInStock = product.variants.some((v) => v.inStock)

  const blocker = !anyInStock
    ? 'Sold out'
    : !variant
      ? 'Choose a size'
      : !variant.inStock
        ? 'Out of stock'
        : null

  function addToBag() {
    if (!variant || blocker) return
    const image = product.images.find((i) => i.variantId === variant.id) ?? product.images[0]
    addItem(
      {
        variantId: variant.id,
        productId: product.id,
        productName: product.name,
        productSlug: product.slug,
        variantLabel: `${variant.size} / ${variant.color}`,
        sku: variant.sku,
        imageUrl: image?.url ?? null,
        unitPrice: Number(variant.price),
      },
      quantity,
    )
    track(
      addToCartEvent(
        {
          productId: product.id,
          sku: variant.sku,
          name: product.name,
          variant: `${variant.size} / ${variant.color}`,
          price: Number(variant.price),
          quantity,
        },
        newEventId(),
      ),
    )
    setAdded(true)
    openCart() // decision #4: show the bag with a Checkout button right away
  }

  const addButton = (
    <Button size="lg" fullWidth onClick={addToBag} disabled={blocker !== null}>
      {blocker ?? (added ? 'Added ✓' : 'Add to bag')}
    </Button>
  )

  return (
    <div className="flex flex-col gap-6">
      <p className="flex items-baseline gap-3">
        <span className="text-2xl font-semibold">{formatBdt(price)}</span>
        {discount !== null && (
          <>
            <s className="text-muted-foreground">
              <span className="sr-only">was </span>
              {formatBdt(compareAt!)}
            </s>
            <span className="text-sm font-medium text-danger">-{discount}%</span>
          </>
        )}
      </p>

      {colors.length > 0 && (
        <fieldset>
          <legend className="text-sm font-medium">
            Color: <span className="font-normal text-muted-foreground">{color}</span>
          </legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {colors.map((c) => (
              <label key={c.color} className="cursor-pointer" title={c.color}>
                <input
                  type="radio"
                  name={`color-${product.id}`}
                  value={c.color}
                  checked={c.color === color}
                  onChange={() => chooseColor(c.color)}
                  // The full name in one place: built from separate text pieces,
                  // screen readers would drop the space ("Blue(sold out)").
                  aria-label={c.inStock ? c.color : `${c.color} (sold out)`}
                  className="peer sr-only"
                />
                <span
                  aria-hidden="true"
                  className={`block size-9 rounded-full border-2 border-transparent ring-1 ring-border-strong peer-checked:border-surface peer-checked:ring-2 peer-checked:ring-brand peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand ${c.inStock ? '' : 'opacity-40'}`}
                  style={{ backgroundColor: c.colorHex ?? '#e5e5e5' }}
                />
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {sizes.length > 0 && (
        <fieldset>
          <div className="flex items-baseline justify-between">
            <legend className="text-sm font-medium">Size</legend>
            {sizeGuideHref && (
              <a href={sizeGuideHref} className="text-sm underline underline-offset-4">
                Size guide
              </a>
            )}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {sizes.map((s) => (
              <label key={s.size} className={s.inStock ? 'cursor-pointer' : 'cursor-not-allowed'}>
                <input
                  type="radio"
                  name={`size-${product.id}`}
                  value={s.size}
                  checked={s.size === size}
                  disabled={!s.inStock}
                  onChange={() => setSize(s.size)}
                  aria-label={s.inStock ? s.size : `${s.size} (out of stock)`}
                  className="peer sr-only"
                />
                <span
                  className={`flex h-11 min-w-12 items-center justify-center rounded-control border px-3 text-sm peer-checked:border-brand peer-checked:bg-brand peer-checked:text-brand-foreground peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand ${
                    s.inStock
                      ? 'border-border-strong'
                      : 'border-border text-muted-foreground line-through'
                  }`}
                >
                  {s.size}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <div className="flex items-end gap-3">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Quantity
          <select
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value))}
            className="h-12 rounded-control border border-border-strong bg-surface px-3 text-base"
          >
            {Array.from({ length: MAX_QTY }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <div className="flex-1">{addButton}</div>
      </div>

      <WishlistButton variantId={variant?.id ?? null} productSlug={product.slug} />

      {/* Announced by screen readers when an item is added */}
      <p role="status" className="text-sm text-success">
        {added
          ? `Added ${quantity} × ${product.name} (${variant?.size} / ${variant?.color}) to your bag.`
          : ''}
      </p>

      {sticky && (
        <div className="fixed inset-x-0 bottom-0 z-30 flex items-center gap-3 border-t border-border bg-surface p-3 md:hidden">
          <span className="font-semibold">{formatBdt(price)}</span>
          <div className="flex-1">{addButton}</div>
        </div>
      )}
    </div>
  )
}
