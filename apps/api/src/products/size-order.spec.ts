import { compareSizes } from './size-order.js'

describe('compareSizes', () => {
  it.each([
    [
      ['XL', 'S', 'M', 'XS', 'L'],
      ['XS', 'S', 'M', 'L', 'XL'],
    ],
    [
      ['3XL', 'XXL', 'XL'],
      ['XL', 'XXL', '3XL'],
    ],
    [
      ['42', '38', '40', '44'],
      ['38', '40', '42', '44'],
    ],
    [
      ['10-11Y', '4-5Y', '2-3Y'],
      ['2-3Y', '4-5Y', '10-11Y'],
    ],
    [
      ['Free size', 'M', '40', '6-7Y'],
      ['M', '40', '6-7Y', 'Free size'],
    ],
  ])('%j → %j', (input, expected) => {
    expect([...input].sort(compareSizes)).toEqual(expected)
  })

  it('treats capitals the same', () => {
    expect(['m', 's', 'L'].sort(compareSizes)).toEqual(['s', 'm', 'L'])
  })
})
