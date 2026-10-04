import { describe, expect, it } from 'vitest'
import { DISTRICTS, DIVISIONS, isDistrictInDivision } from './bangladesh.js'

describe('Bangladesh geography', () => {
  it('has the 8 divisions and 64 districts', () => {
    expect(DIVISIONS).toHaveLength(8)
    expect(DISTRICTS).toHaveLength(64)
  })

  it('has no duplicate district names', () => {
    expect(new Set(DISTRICTS).size).toBe(DISTRICTS.length)
  })

  it('includes "Dhaka", which the seeded DHAKA shipping zone relies on', () => {
    expect(DISTRICTS).toContain('Dhaka')
  })

  it('knows which division a district belongs to', () => {
    expect(isDistrictInDivision('Gazipur', 'Dhaka')).toBe(true)
    expect(isDistrictInDivision('Sylhet', 'Dhaka')).toBe(false)
    expect(isDistrictInDivision('Dhaka', 'Atlantis')).toBe(false)
  })
})
