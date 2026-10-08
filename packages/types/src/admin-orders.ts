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
