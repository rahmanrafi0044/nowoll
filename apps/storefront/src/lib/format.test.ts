import { discountPercent, formatBdt } from './format'

describe('formatBdt', () => {
  it.each([
    ['1490', '৳1,490'],
    ['1499.5', '৳1,499.50'],
    ['590', '৳590'],
    [100000, '৳1,00,000'],
    ['0', '৳0'],
  ])('%s → %s', (input, expected) => {
    expect(formatBdt(input)).toBe(expected)
  })
})

describe('discountPercent', () => {
  it('rounds to a whole percent', () => {
    expect(discountPercent('1890', '2290')).toBe(17)
    expect(discountPercent('1290', '1590')).toBe(19)
  })

  it('returns null when there is no real discount', () => {
    expect(discountPercent('1000', null)).toBeNull()
    expect(discountPercent('1000', '1000')).toBeNull()
    expect(discountPercent('1000', '900')).toBeNull()
  })
})
