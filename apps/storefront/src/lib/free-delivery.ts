import type { ShippingRateView } from '@nowoll/types'

/** What the bag's "৳X more for free delivery" bar needs. */
export interface FreeDeliveryOffer {
  /** Free from this amount (after any discount — the same rule as checkout). */
  threshold: number
  /** The zone's name when zones differ (e.g. "Inside Dhaka"); null when the same everywhere. */
  zone: string | null
}

/**
 * Picks the free-delivery amount to show in the bag, from Admin → Shipping
 * (Rule 6: never a number in the code). The shopper hasn't chosen a district
 * yet, so it shows the LOWEST amount of any zone — and names that zone when
 * zones differ ("৳450 more for free delivery (Inside Dhaka)"), so the promise
 * stays honest. (Not the "default" zone: that is the catch-all for districts
 * not listed elsewhere, e.g. "Outside Dhaka".) No zone with free delivery →
 * null (no bar).
 */
export function freeDeliveryOffer(rates: ShippingRateView[] | null): FreeDeliveryOffer | null {
  const all = rates ?? []
  const amount = (r: ShippingRateView) => Number(r.freeShippingThreshold)
  const free = all.filter((r) => r.freeShippingThreshold !== null)
  const pick = [...free].sort((a, b) => amount(a) - amount(b))[0]
  if (!pick) return null
  const sameEverywhere = free.length === all.length && free.every((r) => amount(r) === amount(pick))
  return { threshold: amount(pick), zone: sameEverywhere ? null : pick.name }
}
