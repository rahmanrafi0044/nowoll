// ============================================================================
// Delivery zones in the admin panel (step 37). A customer pays the fee of the
// zone that LISTS their district; districts listed nowhere use the DEFAULT
// zone. Each order keeps the fee it was charged, so edits affect new
// checkouts only.
// ============================================================================
import type { Money } from './catalog.js'

export interface AdminShippingZone {
  id: string
  /** Internal, never shown ("DHAKA"). Made from the name for new zones. */
  code: string
  /** Shown at checkout: "Inside Dhaka". */
  name: string
  /** Official district names (validation's DISTRICTS). Each in one zone at most. */
  districts: string[]
  /** The catch-all zone. Exactly one, always on. */
  isDefault: boolean
  fee: Money
  /** null = never free. Compared with the order after any discount. */
  freeShippingThreshold: Money | null
  estimatedDaysMin: number | null
  estimatedDaysMax: number | null
  isActive: boolean
  updatedAt: string
}
