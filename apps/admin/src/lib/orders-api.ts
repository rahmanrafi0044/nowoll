import type { AdminOrderDetail, AdminOrderList, OrderStatusChange } from '@nowoll/types'
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

export const changeOrderStatus = (id: string, body: OrderStatusChange) =>
  call<AdminOrderDetail>('PATCH', `/orders/${id}/status`, body)

export const updateTracking = (id: string, body: { courierName: string; trackingNumber: string }) =>
  call<AdminOrderDetail>('PATCH', `/orders/${id}/tracking`, body)

export const updateOrderNotes = (id: string, adminNotes: string | null) =>
  call<AdminOrderDetail>('PATCH', `/orders/${id}/notes`, { adminNotes })

export const markCashCollected = (id: string) =>
  call<AdminOrderDetail>('PATCH', `/orders/${id}/cash-collected`)
