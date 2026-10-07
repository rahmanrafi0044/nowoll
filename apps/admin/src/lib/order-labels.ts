import type { AdminOrderStatus, AdminPaymentStatus } from '@nowoll/types'
import type { BadgeVariant } from '@nowoll/ui'

// One place for how statuses read in the admin panel (badges, filters, buttons).

export const ORDER_STATUS: Record<AdminOrderStatus, { label: string; variant: BadgeVariant }> = {
  PENDING: { label: 'Pending', variant: 'warning' },
  CONFIRMED: { label: 'Confirmed', variant: 'info' },
  PROCESSING: { label: 'Packing', variant: 'info' },
  SHIPPED: { label: 'Shipped', variant: 'neutral' },
  DELIVERED: { label: 'Delivered', variant: 'success' },
  CANCELLED: { label: 'Cancelled', variant: 'danger' },
  RETURNED: { label: 'Returned', variant: 'neutral' },
}

export const PAYMENT_STATUS: Record<AdminPaymentStatus, { label: string; variant: BadgeVariant }> =
  {
    PENDING: { label: 'Unpaid', variant: 'warning' },
    PAID: { label: 'Paid', variant: 'success' },
    FAILED: { label: 'Failed', variant: 'danger' },
    CANCELLED: { label: 'Cancelled', variant: 'neutral' },
    UNDER_REVIEW: { label: 'Check by hand', variant: 'danger' },
    REFUNDED: { label: 'Refunded', variant: 'neutral' },
    PARTIALLY_REFUNDED: { label: 'Part refunded', variant: 'neutral' },
  }

export const PAYMENT_METHOD = {
  COD: 'Cash on delivery',
  SSLCOMMERZ: 'Online (SSLCommerz)',
} as const

/** The button that moves an order to this status. */
export const ACTION_LABEL: Partial<Record<AdminOrderStatus, string>> = {
  CONFIRMED: 'Confirm order',
  PROCESSING: 'Start packing',
  SHIPPED: 'Mark shipped',
  DELIVERED: 'Mark delivered',
  CANCELLED: 'Cancel order',
}

/** Couriers offered as suggestions — any name can be typed. */
export const COURIERS = ['Pathao', 'Steadfast', 'RedX', 'Paperfly', 'Sundarban', 'eCourier']
