import type { OrderFilters } from '@/lib/orders-api'

// The order list's filters come from the page address (?status=PENDING&page=2).
const STATUSES = [
  'PENDING',
  'CONFIRMED',
  'PROCESSING',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED',
  'RETURNED',
]
const PAYMENT_STATUSES = [
  'PENDING',
  'PAID',
  'FAILED',
  'CANCELLED',
  'UNDER_REVIEW',
  'REFUNDED',
  'PARTIALLY_REFUNDED',
]
const DATE = /^\d{4}-\d{2}-\d{2}$/

/** Only known filter values pass through — anything else in the address is ignored. */
export function parseOrderFilters(
  params: Record<string, string | string[] | undefined>,
): OrderFilters {
  const one = (k: string) => (typeof params[k] === 'string' ? params[k] : undefined)
  const page = Number(one('page'))
  const method = one('paymentMethod')
  return {
    q: one('q')?.trim().slice(0, 100) || undefined,
    // One status, or several ("CONFIRMED,PROCESSING" = to ship) — all must be known.
    status: (() => {
      const list = (one('status') ?? '').split(',').filter(Boolean)
      return list.length > 0 && list.every((s) => STATUSES.includes(s)) ? list.join(',') : undefined
    })(),
    paymentMethod: method === 'COD' || method === 'SSLCOMMERZ' ? method : undefined,
    paymentStatus: PAYMENT_STATUSES.find((s) => s === one('paymentStatus')),
    from: DATE.test(one('from') ?? '') ? one('from') : undefined,
    to: DATE.test(one('to') ?? '') ? one('to') : undefined,
    page: Number.isInteger(page) && page > 1 ? page : undefined,
  }
}
