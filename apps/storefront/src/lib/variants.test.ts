import type { ProductImageView, ProductVariantView } from '@nowoll/types'
import {
  colorOptions,
  findVariant,
  imagesForColor,
  initialSelection,
  sizeOptions,
} from './variants'

const v = (id: string, color: string, size: string, inStock = true): ProductVariantView => ({
  id,
  sku: id,
  size,
  color,
  colorHex: null,
  price: '1000',
  compareAtPrice: null,
  inStock,
})

const variants = [
  v('w-s', 'White', 'S', false),
  v('w-m', 'White', 'M', false),
  v('b-s', 'Blue', 'S'),
  v('b-m', 'Blue', 'M', false),
]

describe('colorOptions / sizeOptions / findVariant', () => {
  it('lists colors once, marking colors with no stock at all', () => {
    expect(colorOptions(variants).map((c) => [c.color, c.inStock])).toEqual([
      ['White', false],
      ['Blue', true],
    ])
  })

  it('lists sizes for a color with their availability', () => {
    expect(sizeOptions(variants, 'Blue').map((s) => [s.size, s.inStock])).toEqual([
      ['S', true],
      ['M', false],
    ])
  })

  it('finds the exact variant for a color + size', () => {
    expect(findVariant(variants, 'Blue', 'M')?.id).toBe('b-m')
    expect(findVariant(variants, 'Blue', null)).toBeUndefined()
  })
})

describe('initialSelection', () => {
  it('starts on the first color with stock and does NOT guess a size', () => {
    expect(initialSelection(variants)).toEqual({ color: 'Blue', size: null })
  })

  it('selects the size when there is only one', () => {
    expect(initialSelection([v('x', 'Red', 'Free size')])).toEqual({
      color: 'Red',
      size: 'Free size',
    })
  })

  it('handles a fully sold-out product and an empty one', () => {
    expect(initialSelection([v('a', 'Red', 'S', false)]).color).toBe('Red')
    expect(initialSelection([])).toEqual({ color: null, size: null })
  })
})

describe('imagesForColor', () => {
  const img = (id: string, variantId: string | null): ProductImageView => ({
    id,
    url: `/${id}.jpg`,
    altText: id,
    variantId,
  })
  const images = [img('general', null), img('white-photo', 'w-s'), img('blue-photo', 'b-m')]

  it("shows the color's own photos first, then general photos", () => {
    expect(imagesForColor(images, variants, 'Blue').map((i) => i.id)).toEqual([
      'blue-photo',
      'general',
    ])
  })

  it('falls back to every photo if nothing matches', () => {
    expect(imagesForColor([img('white-photo', 'w-s')], variants, 'Blue').map((i) => i.id)).toEqual([
      'white-photo',
    ])
  })
})
