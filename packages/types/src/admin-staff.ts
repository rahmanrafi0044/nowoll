// ============================================================================
// Staff management (step 38e). ADMIN only. Staff are ordinary shop accounts
// given admin access; 2FA (an authenticator app) is always required.
// ============================================================================

export type StaffRoleView = 'ADMIN' | 'STAFF'

export interface AdminStaffMember {
  id: string
  email: string
  fullName: string | null
  role: StaffRoleView
  /** Has set up the authenticator app. null = Supabase didn't answer. */
  twoFactor: boolean | null
  /** The signed-in admin — can't change their own access. */
  isYou: boolean
  /** When their shop account was made. */
  accountCreatedAt: string
}

export interface StaffChangeView {
  id: string
  action: 'GRANTED' | 'ROLE_CHANGED' | 'REVOKED' | 'TWO_FACTOR_RESET'
  fromRole: 'CUSTOMER' | 'STAFF' | 'ADMIN' | null
  toRole: 'CUSTOMER' | 'STAFF' | 'ADMIN' | null
  createdAt: string
  /** null = a server command (pnpm admin:*). */
  actor: { fullName: string | null; email: string } | null
  target: { fullName: string | null; email: string }
}

export interface AdminStaffPage {
  members: AdminStaffMember[]
  /** The newest 50 changes. */
  changes: StaffChangeView[]
}
