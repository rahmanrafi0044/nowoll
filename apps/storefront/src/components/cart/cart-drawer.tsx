'use client'

import { useEffect, useRef } from 'react'
import { selectItemCount, useCartStore } from '@/stores/cart-store'
import { useUiStore } from '@/stores/ui-store'
import { CartContents } from './cart-contents'
import { CartSummary } from './cart-summary'

// Slide-over bag panel (decision #4: it opens by itself after "Add to bag").
// Built on <dialog>: focus moves into it, Escape closes it, the page behind
// can't be clicked while it's open.
export function CartDrawer() {
  const open = useUiStore((s) => s.cartOpen)
  const close = useUiStore((s) => s.closeCart)
  const count = useCartStore(selectItemCount)
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      aria-labelledby="cart-drawer-title"
      onClose={close}
      onClick={(e) => e.target === ref.current && close()}
      className="m-0 ml-auto h-full max-h-none w-full max-w-md bg-surface p-0 text-foreground shadow-xl backdrop:bg-black/50"
    >
      {open && (
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <h2 id="cart-drawer-title" className="text-lg font-semibold">
              Your bag ({count})
            </h2>
            <button
              type="button"
              onClick={close}
              className="-m-2 inline-flex size-10 items-center justify-center rounded-control hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-brand"
            >
              <span className="sr-only">Close bag</span>
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="size-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-5">
            <CartContents onNavigate={close}>
              {(summary) => (
                <div className="sticky bottom-0 border-t border-border bg-surface py-4">
                  <CartSummary summary={summary} onNavigate={close} showViewBag />
                </div>
              )}
            </CartContents>
          </div>
        </div>
      )}
    </dialog>
  )
}
