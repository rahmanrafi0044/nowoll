import type {
  AdminOrderDetail,
  AdminOrderList,
  NotDeliveredReason,
  OrderInvoice,
  OrderStatusChange,
} from '@nowoll/types'
import { call } from '@/lib/api'

// Orders in the admin panel (step 31) — apps/api/src/orders/admin-orders.*

export interface OrderFilters {
  q?: string
  status?: string
  paymentMethod?: 'COD' | 'SSLCOMMERZ'
  paymentStatus?: string
  /** Shop days (Bangladesh), YYYY-MM-DD. */
  from?: string
  to?: string
  page?: number
}

export function fetchOrders(filters: OrderFilters) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(filters))
    if (value !== undefined && value !== '') params.set(key, String(value))
  return call<AdminOrderList>('GET', `/orders?${params}`)
}

export const fetchOrder = (id: string) => call<AdminOrderDetail>('GET', `/orders/${id}`)

/** The printable invoice's data (order + the shop's details). */
export const fetchInvoice = (id: string) => call<OrderInvoice>('GET', `/orders/${id}/invoice`)

export const changeOrderStatus = (id: string, body: OrderStatusChange) =>
  call<AdminOrderDetail>('PATCH', `/orders/${id}/status`, body)

/** "Parcel came back (not delivered)" — stock back on sale, order cancelled, no email. */
export const markNotDelivered = (id: string, body: { reason: NotDeliveredReason; note?: string }) =>
  call<AdminOrderDetail>('POST', `/orders/${id}/not-delivered`, body)

/** Phase 2: "Book with Steadfast" — books the parcel, marks the order shipped. */
export const bookCourier = (id: string, from: 'CONFIRMED' | 'PROCESSING') =>
  call<AdminOrderDetail>('POST', `/orders/${id}/courier`, { from })

export const updateTracking = (id: string, body: { courierName: string; trackingNumber: string }) =>
  call<AdminOrderDetail>('PATCH', `/orders/${id}/tracking`, body)

export const updateOrderNotes = (id: string, adminNotes: string | null) =>
  call<AdminOrderDetail>('PATCH', `/orders/${id}/notes`, { adminNotes })

export const markCashCollected = (id: string) =>
  call<AdminOrderDetail>('PATCH', `/orders/${id}/cash-collected`)
