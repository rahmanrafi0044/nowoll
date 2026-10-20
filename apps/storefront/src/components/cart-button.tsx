'use client'

import { selectItemCount, useCartStore } from '@/stores/cart-store'
import { useUiStore } from '@/stores/ui-store'
import { BagIcon } from './icons'

// Bag icon with the number of items; opens the bag drawer. The count starts
// at 0 and updates once the saved bag has been loaded (see CartHydrator).
export function CartButton() {
  const count = useCartStore(selectItemCount)
  const openCart = useUiStore((s) => s.openCart)
  return (
    <button
      type="button"
      onClick={openCart}
      aria-haspopup="dialog"
      className="relative inline-flex size-11 items-center justify-center rounded-control focus-visible:outline-2 focus-visible:outline-brand"
    >
      <span className="sr-only">
        Shopping bag, {count} {count === 1 ? 'item' : 'items'}
      </span>
      <BagIcon />
      {count > 0 && (
        <span
          aria-hidden="true"
          className="absolute top-1.5 right-1 flex min-w-4 items-center justify-center rounded-full bg-foreground px-1 text-[10px] font-semibold text-surface"
        >
          {count > 99 ? '99+' : count}
        </span>
      )}
    </button>
  )
}
