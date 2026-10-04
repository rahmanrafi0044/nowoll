import { describe, expect, it } from 'vitest'
import { defaultSettings, defaultShippingZones } from './seed-data'

describe('seed data', () => {
  it('has exactly one default (catch-all) shipping zone — the DB enforces this too', () => {
    expect(defaultShippingZones.filter((z) => z.isDefault)).toHaveLength(1)
  })

  it('has unique setting keys', () => {
    const keys = defaultSettings.map((s) => s.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('includes every business-rule setting the app reads', () => {
    const keys = defaultSettings.map((s) => s.key)
    for (const required of ['vat_rate', 'low_stock_threshold', 'return_window_days']) {
      expect(keys).toContain(required)
    }
  })

  it('never seeds negative fees', () => {
    for (const z of defaultShippingZones) expect(z.fee).toBeGreaterThanOrEqual(0)
  })
})
