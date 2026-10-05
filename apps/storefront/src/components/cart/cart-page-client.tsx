'use client'

import { CartContents } from './cart-contents'
import { CartSummary } from './cart-summary'
import { DiscountForm } from './discount-form'

export function CartPageClient() {
  return (
    <CartContents>
      {(summary) => (
        <aside
          aria-label="Order summary"
          className="mt-8 flex flex-col gap-6 rounded-control border border-border p-5 md:mt-0"
        >
          <h2 className="text-lg font-semibold">Order summary</h2>
          <DiscountForm discount={summary.discount} />
          <CartSummary summary={summary} />
        </aside>
      )}
    </CartContents>
  )
}
