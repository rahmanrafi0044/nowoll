import type { AdminReturnList, AdminReturnView, ReturnStatusView } from '@nowoll/types'
import { call } from '@/lib/api'

// Returns in the admin panel (step 35) — apps/api/src/returns (step 25).

export interface ReturnFilters {
  status?: ReturnStatusView
  /** An order number: "NW-10001" or "10001". */
  q?: string
  page?: number
}

export function fetchReturns(filters: ReturnFilters) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(filters))
    if (value !== undefined && value !== '') params.set(key, String(value))
  return call<AdminReturnList>('GET', `/returns?${params}`)
}

export const fetchReturn = (id: string) => call<AdminReturnView>('GET', `/returns/${id}`)

/** `note` = the instructions the customer is emailed (how to send it back). */
export const approveReturn = (id: string, note: string) =>
  call<AdminReturnView>('PATCH', `/returns/${id}/approve`, { note })

/** `reason` = what the customer is told. */
export const rejectReturn = (id: string, reason: string) =>
  call<AdminReturnView>('PATCH', `/returns/${id}/reject`, { reason })

/** restock false = came back damaged: not put back on sale. */
export const receiveReturn = (id: string, items: { orderItemId: string; restock: boolean }[]) =>
  call<AdminReturnView>('PATCH', `/returns/${id}/receive`, { items })

export const refundReturn = (
  id: string,
  body: { amount: string; method: 'GATEWAY' | 'MANUAL'; reference?: string },
) => call<AdminReturnView>('PATCH', `/returns/${id}/refund`, body)

/** After checking the SSLCommerz panel: did the money go back? */
export const resolveRefund = (
  id: string,
  refundId: string,
  body: { outcome: 'REFUNDED' | 'FAILED'; note: string },
) => call<AdminReturnView>('PATCH', `/returns/${id}/refunds/${refundId}/resolve`, body)
