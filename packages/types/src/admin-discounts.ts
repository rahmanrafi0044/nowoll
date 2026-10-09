// ============================================================================
// Discount codes in the admin panel (step 34; the codes themselves are from
// step 15). Usage counts only orders that still hold the code — a cancelled
// order gives its use back.
// ============================================================================
import type { Paginated } from './api.js'
import type { Money } from './catalog.js'

/**
 * Worked out in this order (the first that applies):
 * off → expired → used up → scheduled → active.
 */
export type DiscountStatus = 'ACTIVE' | 'SCHEDULED' | 'EXPIRED' | 'USED_UP' | 'OFF'

export interface AdminDiscountRow {
  id: string
  /** Always upper case. */
  code: string
  /** Internal note, e.g. "Eid 2026 campaign". */
  description: string | null
  type: 'PERCENTAGE' | 'FIXED_AMOUNT'
  /** 10 = 10% (PERCENTAGE) or ৳10 (FIXED_AMOUNT). */
  value: Money
  minOrderAmount: Money | null
  /** Caps a percentage discount. */
  maxDiscountAmount: Money | null
  usageLimit: number | null
  usageLimitPerCustomer: number | null
  usedCount: number
  startsAt: string | null
  expiresAt: string | null
  isActive: boolean
  createdAt: string
  status: DiscountStatus
  /** Total taken off orders with this code. */
  totalDiscounted: Money
  /** Order totals of sales (confirmed or later) that used this code. */
  salesTotal: Money
}

export type AdminDiscountList = Paginated<AdminDiscountRow>

/** GET /discounts/:id — the code plus the orders that used it, newest first. */
export interface AdminDiscountDetail extends AdminDiscountRow {
  usages: {
    orderId: string
    orderNumber: string
    customerName: string
    email: string
    /** What the code took off this order. */
    amount: Money
    orderTotal: Money
    orderStatus: string
    createdAt: string
  }[]
}
