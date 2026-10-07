// ============================================================================
// Admin customer management (step 32). "Customers" = shop ACCOUNTS (role
// CUSTOMER). Guest buyers have no account — find their orders in the Orders
// search by email or phone. "Spent" uses the dashboard's sales rule: orders
// that are confirmed or further (not pending, cancelled or returned).
// ============================================================================
import type { AdminOrderRow } from './admin-orders.js'
import type { Paginated } from './api.js'
import type { Money } from './catalog.js'

export interface AdminCustomerRow {
  id: string
  name: string | null
  email: string
  phone: string | null
  status: 'ACTIVE' | 'BANNED'
  joinedAt: string
  orderCount: number
  totalSpent: Money
  lastOrderAt: string | null
}

export type AdminCustomerList = Paginated<AdminCustomerRow>

export interface AdminCustomerDetail {
  id: string
  name: string | null
  email: string
  phone: string | null
  status: 'ACTIVE' | 'BANNED'
  joinedAt: string
  ban: { reason: string; at: string | null; by: string | null } | null
  stats: {
    orderCount: number
    totalSpent: Money
    averageOrder: Money
    firstOrderAt: string | null
    lastOrderAt: string | null
    reviewCount: number
    returnCount: number
  }
  addresses: {
    id: string
    label: string | null
    fullName: string
    phone: string
    line1: string
    line2: string | null
    area: string | null
    district: string
    division: string
    isDefault: boolean
  }[]
  /** Orders placed while signed in to this account, newest first. */
  orders: AdminOrderRow[]
  /**
   * STAFF ONLY: guest orders (no account) with this account's email or phone —
   * e.g. to spot a repeat fake cash-on-delivery customer. Never shown to the customer.
   */
  guestOrders: AdminOrderRow[]
}
