import type { OrderTrackingView } from '@nowoll/types'

type Status = OrderTrackingView['status']
type PaymentStatus = OrderTrackingView['paymentStatus']

/** The customer's words for each order status (the database's are for staff). */
export const STATUS_LABEL: Record<Status, string> = {
  PENDING: 'Order placed',
  CONFIRMED: 'Confirmed',
  PROCESSING: 'Being packed',
  SHIPPED: 'On its way',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  RETURNED: 'Returned',
}

/** The normal journey of an order, shown as a progress list. */
export const JOURNEY: Status[] = ['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED']

export function paymentText(
  method: OrderTrackingView['paymentMethod'],
  status: PaymentStatus,
  total: string,
  formatBdt: (amount: string) => string,
): string {
  if (method === 'COD')
    return status === 'PAID'
      ? 'Cash on delivery — paid'
      : `Cash on delivery — pay ${formatBdt(total)} when it arrives`
  switch (status) {
    case 'PAID':
      return 'Paid online'
    case 'UNDER_REVIEW':
      return "Payment received — we're checking it"
    case 'REFUNDED':
      return 'Refunded'
    case 'PARTIALLY_REFUNDED':
      return 'Partly refunded'
    case 'PENDING':
      return 'Online payment — not paid yet'
    default:
      return 'Online payment — not completed'
  }
}

export const formatDate = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Dhaka',
  }).format(new Date(iso))
