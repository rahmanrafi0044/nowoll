import type { AdminStaffPage, StaffRoleView } from '@nowoll/types'
import { call } from '@/lib/api'

// Admin → Staff (step 38e) — apps/api/src/staff. ADMIN only.

export const fetchStaff = () => call<AdminStaffPage>('GET', '/admin/staff')

export const addStaff = (email: string, role: StaffRoleView) =>
  call<{ id: string }>('POST', '/admin/staff', { email, role })

export const changeStaffRole = (id: string, role: StaffRoleView) =>
  call<{ id: string }>('PATCH', `/admin/staff/${id}`, { role })

/** Back to a customer account (the account and its orders stay). */
export const removeStaff = (id: string) => call<{ id: string }>('DELETE', `/admin/staff/${id}`)

/** Lost phone: their authenticator app is removed; the next sign-in sets up a new one. */
export const resetStaffTwoFactor = (id: string) =>
  call<{ id: string }>('POST', `/admin/staff/${id}/reset-2fa`)
