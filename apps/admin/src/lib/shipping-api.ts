import type { AdminShippingZone } from '@nowoll/types'
import { call } from '@/lib/api'

// Admin → Shipping (step 37) — apps/api/src/shipping.

export interface ZoneFields {
  name: string
  fee: number
  freeShippingThreshold: number | null
  estimatedDaysMin: number | null
  estimatedDaysMax: number | null
  districts: string[]
  isActive: boolean
  isDefault: boolean
}

export const fetchZones = () => call<AdminShippingZone[]>('GET', '/admin/shipping/zones')

/** moveDistricts: districts already in another zone are moved here (instead of a 409). */
export const createZone = (body: ZoneFields & { moveDistricts?: boolean }) =>
  call<AdminShippingZone>('POST', '/admin/shipping/zones', body)

export const updateZone = (id: string, body: Partial<ZoneFields> & { moveDistricts?: boolean }) =>
  call<AdminShippingZone>('PATCH', `/admin/shipping/zones/${id}`, body)

/**
 * The zone a district gets — the same rule as checkout (ShippingService.zoneFor):
 * the switched-on zone that lists it, otherwise the default zone.
 */
export function zoneForDistrict(
  zones: AdminShippingZone[],
  district: string,
): AdminShippingZone | undefined {
  const on = zones.filter((z) => z.isActive)
  return on.find((z) => z.districts.includes(district)) ?? on.find((z) => z.isDefault)
}
