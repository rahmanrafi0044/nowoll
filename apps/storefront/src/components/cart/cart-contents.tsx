'use client'

import Link from 'next/link'
import { useCartHydrated } from '@/hooks/use-cart-hydrated'
import { type CartQuoteState, useCartQuote } from '@/hooks/use-cart-quote'
import { useCartStore } from '@/stores/cart-store'
import { CartLine } from './cart-line'

/** The list of lines plus loading/empty/error states — shared by the drawer and /cart. */
export function CartContents({
  onNavigate,
  children,
}: {
  onNavigate?: () => void
  children: (summary: CartQuoteState) => React.ReactNode
}) {
  const hydrated = useCartHydrated()
  const items = useCartStore((s) => s.items)
  const summary = useCartQuote()

  if (!hydrated) return <p className="py-12 text-center text-muted-foreground">Loading your bag…</p>

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-12 text-center">
        <p className="text-lg font-medium">Your bag is empty</p>
        <Link
          href="/shop"
          onClick={onNavigate}
          className="text-sm font-medium underline underline-offset-4"
        >
          Continue shopping
        </Link>
      </div>
    )
  }

  return (
    <>
      {summary.error && (
        <p role="alert" className="mb-2 text-sm text-danger">
          {summary.error}
        </p>
      )}
      <ul className="divide-y divide-border" aria-busy={summary.loading}>
        {items.map((item) => (
          <CartLine
            key={item.variantId}
            item={item}
            line={summary.lineFor(item.variantId)}
            priceChanged={summary.priceChanged.has(item.variantId)}
            onNavigate={onNavigate}
          />
        ))}
      </ul>
      {children(summary)}
    </>
  )
}
