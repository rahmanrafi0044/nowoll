// ============================================================================
// Shopping events (step 39a). Each builder turns one moment in the shop
// ("added to bag") into what each tool expects — GA4's ecommerce format
// (also pushed to GTM's dataLayer) and Meta's standard event — so the pages
// never deal with three formats. Field names are the official ones
// (docs/integrations/analytics.md, docs/integrations/meta.md).
//
// IDs: Meta gets the variant SKU (= the catalog item, step 39c) and the
// product id for a whole product (= the catalog's item_group_id). GA4 gets
// the product id with the size/colour as item_variant, so its product
// reports follow one product from "viewed" to "bought".
// ============================================================================

export const CURRENCY = 'BDT'

/** One product line (a variant and how many). */
export interface TrackedItem {
  /** null if the product was deleted since the order (the SKU stands in). */
  productId: string | null
  sku: string
  name: string
  /** e.g. "M / Blue" */
  variant: string
  /** Price of one, in taka. */
  price: number
  quantity: number
}

export interface Ga4Item {
  item_id: string
  item_name: string
  item_variant?: string
  price: number
  quantity: number
}

export interface MetaContent {
  id: string
  quantity: number
  item_price: number
}

/** One event, ready for every tool. */
export interface TrackEvent {
  ga4: { name: string; params: Record<string, unknown> }
  meta: { name: string; data: Record<string, unknown>; eventId: string }
}

/** Money to 2 decimals (adding prices in floating point can give 2989.9999). */
const money = (n: number) => Math.round(n * 100) / 100

const ga4Item = (i: TrackedItem): Ga4Item => ({
  item_id: i.productId ?? i.sku,
  item_name: i.name,
  ...(i.variant ? { item_variant: i.variant } : {}),
  price: money(i.price),
  quantity: i.quantity,
})

const metaContent = (i: TrackedItem): MetaContent => ({
  id: i.sku,
  quantity: i.quantity,
  item_price: money(i.price),
})

const valueOf = (items: TrackedItem[]) => money(items.reduce((s, i) => s + i.price * i.quantity, 0))

/** A fresh ID for one event — Meta uses it to match the browser and server copies (step 39b). */
export function newEventId(): string {
  return globalThis.crypto.randomUUID()
}

/**
 * The Purchase event ID is built from the order number, so the server
 * (Conversions API, step 39b) can send the same ID without the browser.
 */
export const purchaseEventId = (orderNumber: string) => `purchase-${orderNumber}`

/** A product page was opened. */
export function viewItemEvent(
  p: { productId: string; name: string; price: number },
  eventId: string,
): TrackEvent {
  const price = money(p.price)
  return {
    ga4: {
      name: 'view_item',
      params: {
        currency: CURRENCY,
        value: price,
        items: [{ item_id: p.productId, item_name: p.name, price, quantity: 1 }],
      },
    },
    meta: {
      name: 'ViewContent',
      data: {
        content_ids: [p.productId],
        content_type: 'product_group',
        content_name: p.name,
        value: price,
        currency: CURRENCY,
      },
      eventId,
    },
  }
}

/** "Add to bag". */
export function addToCartEvent(item: TrackedItem, eventId: string): TrackEvent {
  const value = valueOf([item])
  return {
    ga4: { name: 'add_to_cart', params: { currency: CURRENCY, value, items: [ga4Item(item)] } },
    meta: {
      name: 'AddToCart',
      data: {
        content_ids: [item.sku],
        content_type: 'product',
        contents: [metaContent(item)],
        content_name: item.name,
        value,
        currency: CURRENCY,
      },
      eventId,
    },
  }
}

/** The checkout page was opened with these items. */
export function beginCheckoutEvent(items: TrackedItem[], eventId: string): TrackEvent {
  const value = valueOf(items)
  return {
    ga4: {
      name: 'begin_checkout',
      params: { currency: CURRENCY, value, items: items.map(ga4Item) },
    },
    meta: {
      name: 'InitiateCheckout',
      data: {
        content_ids: items.map((i) => i.sku),
        content_type: 'product',
        contents: items.map(metaContent),
        num_items: items.reduce((s, i) => s + i.quantity, 0),
        value,
        currency: CURRENCY,
      },
      eventId,
    },
  }
}

export interface TrackedOrder {
  /** e.g. "NW-10001" */
  orderNumber: string
  items: TrackedItem[]
  /** What the customer pays (after discount, with delivery and VAT). */
  total: number
  shipping: number
  tax: number
  coupon?: string | null
}

/** An order was placed (cash on delivery) or paid (online). */
export function purchaseEvent(order: TrackedOrder): TrackEvent {
  const value = money(order.total)
  return {
    ga4: {
      name: 'purchase',
      params: {
        transaction_id: order.orderNumber,
        currency: CURRENCY,
        value,
        tax: money(order.tax),
        shipping: money(order.shipping),
        ...(order.coupon ? { coupon: order.coupon } : {}),
        items: order.items.map(ga4Item),
      },
    },
    meta: {
      name: 'Purchase',
      data: {
        content_ids: order.items.map((i) => i.sku),
        content_type: 'product',
        contents: order.items.map(metaContent),
        num_items: order.items.reduce((s, i) => s + i.quantity, 0),
        order_id: order.orderNumber,
        value,
        currency: CURRENCY,
      },
      eventId: purchaseEventId(order.orderNumber),
    },
  }
}

// ── "Purchase" once per order ────────────────────────────────────────────

export const TRACKED_ORDERS_KEY = 'nowoll-tracked-orders'
const TRACKED_ORDERS_KEEP = 50

/**
 * Has this order's purchase been sent from this browser already? Returns the
 * list to save if it's new (so a refresh of the thank-you page doesn't count
 * the sale twice), or null if it was sent before.
 */
export function recordTrackedOrder(saved: string | null, orderNumber: string): string | null {
  let list: string[] = []
  try {
    const v: unknown = JSON.parse(saved ?? '[]')
    if (Array.isArray(v)) list = v.filter((x): x is string => typeof x === 'string')
  } catch {
    // broken → start again
  }
  if (list.includes(orderNumber)) return null
  return JSON.stringify([...list, orderNumber].slice(-TRACKED_ORDERS_KEEP))
}
