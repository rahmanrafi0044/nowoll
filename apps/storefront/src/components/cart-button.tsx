'use client'

import Link from 'next/link'
import { selectItemCount, useCartStore } from '@/stores/cart-store'

// Bag icon with the number of items. The cart page itself arrives in
// Phase 3 (step 16). The count starts at 0 and updates once the saved cart
// has been loaded from the browser (see CartHydrator).
export function CartButton() {
  const count = useCartStore(selectItemCount)
  return (
    <Link
      href="/cart"
      className="relative inline-flex size-11 items-center justify-center rounded-control hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-brand"
    >
      <span className="sr-only">
        Shopping bag, {count} {count === 1 ? 'item' : 'items'}
      </span>
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="size-6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <path d="M6 8h12l-1 12H7L6 8z" />
        <path d="M9 8V6a3 3 0 016 0v2" />
      </svg>
      {count > 0 && (
        <span
          aria-hidden="true"
          className="absolute top-1 right-1 flex min-w-5 items-center justify-center rounded-full bg-brand px-1 text-[11px] font-semibold text-brand-foreground"
        >
          {count > 99 ? '99+' : count}
        </span>
      )}
    </Link>
  )
}
