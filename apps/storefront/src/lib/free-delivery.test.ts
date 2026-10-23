import type { ShippingRateView } from '@nowoll/types'
import { freeDeliveryOffer } from './free-delivery'

const zone = (name: string, threshold: string | null, isDefault = false): ShippingRateView => ({
  id: name,
  code: name,
  name,
  fee: '60',
  freeShippingThreshold: threshold,
  estimatedDaysMin: null,
  estimatedDaysMax: null,
  districts: [],
  isDefault,
})

describe('freeDeliveryOffer (38f bag bar)', () => {
  it('no zone with free delivery, or no zones at all → no bar', () => {
    expect(freeDeliveryOffer(null)).toBeNull()
    expect(freeDeliveryOffer([zone('Dhaka', null, true)])).toBeNull()
  })

  it('the same amount everywhere → no zone name', () => {
    expect(freeDeliveryOffer([zone('Dhaka', '2000', true), zone('Outside', '2000')])).toEqual({
      threshold: 2000,
      zone: null,
    })
  })

  it('zones differ → the lowest amount, with its zone named (not the catch-all default)', () => {
    expect(
      freeDeliveryOffer([zone('Inside Dhaka', '3000'), zone('Outside Dhaka', '5000', true)]),
    ).toEqual({ threshold: 3000, zone: 'Inside Dhaka' })
  })

  it('only one zone has free delivery → named, even if it is the only amount', () => {
    expect(
      freeDeliveryOffer([zone('Inside Dhaka', '3000'), zone('Outside Dhaka', null, true)]),
    ).toEqual({ threshold: 3000, zone: 'Inside Dhaka' })
  })
})
