// ============================================================================
// Admin order management (step 31). Everything staff need to run the
// confirm → pack → ship → deliver flow by hand (Phase 1 courier = manual).
// ============================================================================
import type { Paginated } from './api.js'
import type { Money } from './catalog.js'

export type AdminOrderStatus =
  'PENDING' | 'CONFIRMED' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED' | 'RETURNED'

export type AdminPaymentStatus =
  'PENDING' | 'PAID' | 'FAILED' | 'CANCELLED' | 'UNDER_REVIEW' | 'REFUNDED' | 'PARTIALLY_REFUNDED'

export interface AdminOrderRow {
  id: string
  /** "NW-10001" */
  number: string
  status: AdminOrderStatus
  paymentMethod: 'COD' | 'SSLCOMMERZ'
  paymentStatus: AdminPaymentStatus
  customerName: string
  phone: string
  email: string
  district: string
  itemCount: number
  total: Money
  createdAt: string
}

export type AdminOrderList = Paginated<AdminOrderRow>

export interface AdminOrderDetail {
  id: string
  number: string
  status: AdminOrderStatus
  paymentMethod: 'COD' | 'SSLCOMMERZ'
  paymentStatus: AdminPaymentStatus
  customer: {
    name: string
    email: string
    phone: string
    hasAccount: boolean
    /** The customer account that placed it (null = guest) — for the customer page link. */
    accountId: string | null
    /**
     * Earlier orders with this phone number whose parcel came back undelivered —
     * worth a careful confirmation call before sending cash on delivery again.
     */
    parcelsReturned: number
  }
  address: {
    line1: string
    line2: string | null
    area: string | null
    district: string
    division: string
    postalCode: string | null
    zoneName: string
  }
  items: {
    id: string
    productId: string | null
    productName: string
    variantLabel: string
    sku: string
    imageUrl: string | null
    unitPrice: Money
    quantity: number
    lineTotal: Money
  }[]
  totals: {
    subtotal: Money
    discountAmount: Money
    discountCode: string | null
    shippingFee: Money
    vatRate: Money
    vatAmount: Money
    total: Money
  }
  payments: {
    id: string
    method: 'COD' | 'SSLCOMMERZ'
    status: AdminPaymentStatus
    amount: Money
    transactionId: string
    bankTransactionId: string | null
    paidAt: string | null
    createdAt: string
  }[]
  courierName: string | null
  trackingNumber: string | null
  /** Phase 2: set when booked through the courier's API ("Book with Steadfast"). */
  courierConsignmentId: string | null
  /** The courier's own word for where the parcel is, and when it last changed. */
  courierStatus: string | null
  courierStatusAt: string | null
  /**
   * Can "Book with …" be used on this shop right now? off = switched off in
   * Settings; no_keys = the keys aren't in the server settings; not_built = the
   * connection waits for the courier's official docs; ready = yes.
   */
  courierBooking: { name: string; readiness: 'off' | 'no_keys' | 'not_built' | 'ready' }
  /** What the customer wrote at checkout. */
  customerNote: string | null
  /** Staff only — never shown to the customer. */
  adminNotes: string | null
  cancelReason: string | null
  /** Oldest first. `by` = the staff member, or null for the system (checkout, payment, sweep). */
  timeline: {
    from: AdminOrderStatus | null
    to: AdminOrderStatus
    note: string | null
    by: string | null
    at: string
  }[]
  /** The status changes allowed from here (computed by the API — the one source of truth). */
  allowedNext: AdminOrderStatus[]
  /** COD, not yet marked paid, and already shipped or delivered. */
  canMarkCashCollected: boolean
  /** Shipped — so "Parcel came back (not delivered)" can be pressed. */
  canMarkNotDelivered: boolean
  createdAt: string
  updatedAt: string
}

/** PATCH /orders/:id/status */
export interface OrderStatusChange {
  /** The status the person SAW — refused if the order changed meanwhile. */
  from: AdminOrderStatus
  to: AdminOrderStatus
  /** Required for CANCELLED (the reason); optional otherwise. */
  note?: string
  /** Required for SHIPPED. */
  courierName?: string
  trackingNumber?: string
  /** DELIVERED + cash on delivery: the cash was collected → paid. */
  cashCollected?: boolean
}

/** GET /orders/:id/invoice — what the printable invoice page shows. */
export interface OrderInvoice {
  order: AdminOrderDetail
  /** The shop's details from the settings (empty ones are null — left off the invoice). */
  store: {
    name: string
    tagline: string | null
    address: string | null
    phone: string | null
    email: string | null
  }
  /** Today, as a shop date (Bangladesh): YYYY-MM-DD. */
  issuedOn: string
}

/**
 * Why a shipped parcel came back undelivered — POST /orders/:id/not-delivered.
 * Recorded in the cancel reason so repeat problems (fake orders, refusals) show up.
 */
export const NOT_DELIVERED_REASONS = {
  REFUSED: 'customer refused the parcel',
  UNREACHABLE: 'customer could not be reached',
  WRONG_ADDRESS: 'wrong or incomplete address',
  FAKE_ORDER: 'fake order',
  OTHER: 'other reason',
} as const
export type NotDeliveredReason = keyof typeof NOT_DELIVERED_REASONS

/** Every cancel reason written by that button starts with this. */
export const NOT_DELIVERED_PREFIX = 'Not delivered — returned by courier'
