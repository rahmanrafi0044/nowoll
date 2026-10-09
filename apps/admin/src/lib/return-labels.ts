import type { ReturnReasonView, ReturnStatusView } from '@nowoll/types'
import type { BadgeVariant } from '@nowoll/ui'

export const RETURN_STATUS: Record<ReturnStatusView, { label: string; variant: BadgeVariant }> = {
  REQUESTED: { label: 'To decide', variant: 'warning' },
  APPROVED: { label: 'Waiting for parcel', variant: 'info' },
  RECEIVED: { label: 'To refund', variant: 'warning' },
  REFUNDED: { label: 'Refunded', variant: 'success' },
  REJECTED: { label: 'Rejected', variant: 'neutral' },
}

export const RETURN_REASON: Record<ReturnReasonView, string> = {
  WRONG_SIZE: 'Wrong size',
  DAMAGED: 'Arrived damaged',
  NOT_AS_DESCRIBED: 'Not as described',
  CHANGED_MIND: 'Changed their mind',
  OTHER: 'Other',
}

/** The list's tabs, in the order the work happens. */
export const RETURN_TABS: { status: ReturnStatusView | undefined; label: string }[] = [
  { status: 'REQUESTED', label: 'To decide' },
  { status: 'APPROVED', label: 'Waiting for parcel' },
  { status: 'RECEIVED', label: 'To refund' },
  { status: 'REFUNDED', label: 'Refunded' },
  { status: 'REJECTED', label: 'Rejected' },
  { status: undefined, label: 'All' },
]

/** The approval instructions box starts with this (editable) — the customer receives it by email. */
export const APPROVE_TEMPLATE =
  'Our courier will collect the item within 3 days. Please keep the tags on and pack it in its original bag. We will refund you once it reaches us.'
