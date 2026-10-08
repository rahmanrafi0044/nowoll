import type { AdminCustomerDetail, AdminCustomerList } from '@nowoll/types'
import { call } from '@/lib/api'

// Customer accounts in the admin panel (step 32) — apps/api/src/customers.

export interface CustomerFilters {
  q?: string
  status?: 'ACTIVE' | 'BANNED'
  sort?: 'newest' | 'spent' | 'orders' | 'name'
  page?: number
}

export function fetchCustomers(filters: CustomerFilters) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(filters))
    if (value !== undefined && value !== '') params.set(key, String(value))
  return call<AdminCustomerList>('GET', `/admin/customers?${params}`)
}

export const fetchCustomer = (id: string) =>
  call<AdminCustomerDetail>('GET', `/admin/customers/${id}`)

export const banCustomer = (id: string, reason: string) =>
  call<AdminCustomerDetail>('PATCH', `/admin/customers/${id}/ban`, { reason })

export const unbanCustomer = (id: string) =>
  call<AdminCustomerDetail>('PATCH', `/admin/customers/${id}/unban`)
