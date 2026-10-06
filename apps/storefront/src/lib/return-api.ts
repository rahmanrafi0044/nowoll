import type { MyReturnView, ReturnEligibilityView, ReturnReasonView } from '@nowoll/types'
import { call } from '@/lib/cart-api'

// Returns (step 25) — the signed-in customer's side.
export const fetchReturnEligibility = (orderNumber: string) =>
  call<ReturnEligibilityView>('GET', `/returns/eligibility/${encodeURIComponent(orderNumber)}`)

export const fetchMyReturns = () => call<MyReturnView[]>('GET', '/returns/my')

export const requestReturn = (body: {
  orderNumber: string
  items: { orderItemId: string; quantity: number }[]
  reason: ReturnReasonView
  note: string | null
}) => call<MyReturnView>('POST', '/returns', body)
