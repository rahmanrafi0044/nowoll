import type { AdminDiscountDetail, AdminDiscountList, DiscountStatus } from '@nowoll/types'
import { call } from '@/lib/api'

// Discount codes in the admin panel (step 34) — apps/api/src/discounts.

export interface DiscountFilters {
  q?: string
  status?: DiscountStatus
  page?: number
}

export function fetchDiscounts(filters: DiscountFilters) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(filters))
    if (value !== undefined && value !== '') params.set(key, String(value))
  return call<AdminDiscountList>('GET', `/discounts?${params}`)
}

export const fetchDiscount = (id: string) => call<AdminDiscountDetail>('GET', `/discounts/${id}`)

/** The fields the API takes (money as numbers, dates as ISO instants). */
export interface DiscountFields {
  code: string
  description: string | null
  type: 'PERCENTAGE' | 'FIXED_AMOUNT'
  value: number
  minOrderAmount: number | null
  maxDiscountAmount: number | null
  usageLimit: number | null
  usageLimitPerCustomer: number | null
  startsAt: string | null
  expiresAt: string | null
  isActive: boolean
}

export const createDiscount = (body: DiscountFields) =>
  call<{ id: string }>('POST', '/discounts', body)

export const updateDiscount = (id: string, body: Partial<DiscountFields>) =>
  call<{ id: string }>('PATCH', `/discounts/${id}`, body)

/** Archive: stops working at once; past orders keep their record of it. */
export const archiveDiscount = (id: string) => call<{ id: string }>('DELETE', `/discounts/${id}`)
