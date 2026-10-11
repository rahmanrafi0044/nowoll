import {
  purchaseEvent,
  recordTrackedOrder,
  type TrackedItem,
  TRACKED_ORDERS_KEY,
} from '@nowoll/analytics'
import type { OrderReceiptView } from '@nowoll/types'
import type { CartItem } from '@/stores/cart-store'
import { track } from '@/stores/tracking-store'

// Turns the shop's own shapes (bag lines, the order receipt) into the
// tracking package's TrackedItem (step 39a).

export const cartItemsToTracked = (items: CartItem[]): TrackedItem[] =>
  items.map((i) => ({
    productId: i.productId,
    sku: i.sku,
    name: i.productName,
    variant: i.variantLabel,
    price: i.unitPrice,
    quantity: i.quantity,
  }))

/** Orders opened later (an old link) aren't new sales. */
const PURCHASE_WINDOW_MS = 24 * 60 * 60 * 1000

/**
 * The order is placed (cash on delivery) or paid (online) → "purchase", once:
 * this browser remembers which orders it already reported, so refreshing the
 * thank-you page doesn't count the sale twice.
 */
export function trackPurchaseOnce(receipt: OrderReceiptView, now = Date.now()): void {
  if (receipt.status === 'CANCELLED') return
  if (now - new Date(receipt.placedAt).getTime() > PURCHASE_WINDOW_MS) return
  let saved: string | null = null
  try {
    saved = localStorage.getItem(TRACKED_ORDERS_KEY)
  } catch {
    // storage blocked → we can't remember; still report this once
  }
  const next = recordTrackedOrder(saved, receipt.displayNumber)
  if (next === null) return
  try {
    localStorage.setItem(TRACKED_ORDERS_KEY, next)
  } catch {
    // ignore
  }
  track(
    purchaseEvent({
      orderNumber: receipt.displayNumber,
      items: receipt.items.map((l) => ({
        productId: l.productId,
        sku: l.sku,
        name: l.productName,
        variant: l.variantLabel,
        price: Number(l.unitPrice),
        quantity: l.quantity,
      })),
      total: Number(receipt.totals.total),
      shipping: Number(receipt.totals.shippingFee),
      tax: Number(receipt.totals.vatAmount),
      coupon: receipt.totals.discountCode,
    }),
  )
}
