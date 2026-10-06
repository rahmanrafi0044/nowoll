'use client'

import { Button } from '@nowoll/ui'
import Image from 'next/image'
import Link from 'next/link'
import { useAccountData } from '@/hooks/use-account-data'
import { fetchWishlist, removeFromWishlist } from '@/lib/account-api'
import { discountPercent, formatBdt } from '@/lib/format'
import { useCartStore } from '@/stores/cart-store'
import { useUiStore } from '@/stores/ui-store'

/** /account/wishlist — saved sizes/colours with today's price and stock. */
export function WishlistPage() {
  const { data, error, setData } = useAccountData(fetchWishlist)
  const addItem = useCartStore((s) => s.addItem)
  const openCart = useUiStore((s) => s.openCart)

  if (error)
    return (
      <p role="alert" className="text-danger">
        {error.message}
      </p>
    )
  if (!data) return <p className="text-muted-foreground">Loading your wishlist…</p>
  if (data.length === 0)
    return (
      <div className="flex flex-col gap-2">
        <p>Your wishlist is empty.</p>
        <p className="text-sm text-muted-foreground">
          On any product, choose a size and tap <strong>Save for later</strong>.{' '}
          <Link href="/shop" className="font-medium text-foreground underline underline-offset-4">
            Browse the shop
          </Link>
        </p>
      </div>
    )

  return (
    <ul className="grid gap-4 sm:grid-cols-2">
      {data.map((item) => {
        const off = discountPercent(item.price, item.compareAtPrice)
        return (
          <li key={item.variantId} className="flex gap-4 rounded-control border border-border p-3">
            <Link
              href={`/products/${item.productSlug}`}
              className="relative size-24 shrink-0 overflow-hidden rounded-control bg-surface-muted"
            >
              {item.imageUrl && (
                <Image src={item.imageUrl} alt="" fill sizes="96px" className="object-cover" />
              )}
            </Link>
            <div className="flex flex-1 flex-col gap-1 text-sm">
              <Link href={`/products/${item.productSlug}`} className="font-medium hover:underline">
                {item.productName}
              </Link>
              <p className="text-muted-foreground">
                {item.size} / {item.color}
              </p>
              <p>
                <span className="font-medium tabular-nums">{formatBdt(item.price)}</span>
                {off !== null && <span className="ml-2 text-danger">-{off}%</span>}
              </p>
              {!item.inStock && <p className="text-muted-foreground">Sold out</p>}
              <div className="mt-auto flex gap-3 pt-2">
                <Button
                  size="sm"
                  disabled={!item.inStock}
                  onClick={() => {
                    addItem({
                      variantId: item.variantId,
                      productId: item.productId,
                      productName: item.productName,
                      productSlug: item.productSlug,
                      variantLabel: `${item.size} / ${item.color}`,
                      sku: item.sku,
                      imageUrl: item.imageUrl,
                      unitPrice: Number(item.price),
                    })
                    openCart()
                  }}
                >
                  Add to bag
                </Button>
                <button
                  type="button"
                  className="text-sm underline underline-offset-4"
                  aria-label={`Remove ${item.productName} (${item.size} / ${item.color}) from your wishlist`}
                  onClick={async () => {
                    setData(data.filter((d) => d.variantId !== item.variantId)) // feels instant
                    await removeFromWishlist(item.variantId)
                  }}
                >
                  Remove
                </button>
              </div>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
