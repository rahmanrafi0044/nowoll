import { describe, expect, it } from 'vitest'
import { canPayOnline, sameAmount, toPoisha, twoDecimals } from './money.js'

describe('money helpers', () => {
  it('converts amounts to whole poisha', () => {
    expect([toPoisha('1550'), toPoisha('1550.5'), toPoisha('1550.50'), toPoisha('0.05')]).toEqual([
      155000, 155050, 155050, 5,
    ])
    expect([toPoisha('1,550'), toPoisha('-5'), toPoisha('1e3'), toPoisha('1550.123')]).toEqual([
      null,
      null,
      null,
      null,
    ])
  })

  it('compares amounts exactly', () => {
    expect(sameAmount('1550', '1550.00')).toBe(true)
    expect(sameAmount('1550.00', '1549.99')).toBe(false)
    expect(sameAmount('abc', 'abc')).toBe(false)
  })

  it('formats for SSLCommerz with two decimals', () => {
    expect([twoDecimals('1550'), twoDecimals('1550.5'), twoDecimals('10.05')]).toEqual([
      '1550.00',
      '1550.50',
      '10.05',
    ])
  })

  it('allows online payment only from ৳10 to ৳500,000 (decision #3)', () => {
    expect(['9.99', '10', '500000', '500000.01'].map(canPayOnline)).toEqual([
      false,
      true,
      true,
      false,
    ])
  })
})
