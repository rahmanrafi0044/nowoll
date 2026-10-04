import { pickUniqueSlug, slugPrefixOf } from './slugs.js'

describe('pickUniqueSlug', () => {
  it('uses the plain slug when free', () => {
    expect(pickUniqueSlug('Oxford Shirt', new Set(), 'product')).toBe('oxford-shirt')
  })

  it('adds the first free numeric suffix', () => {
    const taken = new Set(['oxford-shirt', 'oxford-shirt-2'])
    expect(pickUniqueSlug('Oxford Shirt', taken, 'product')).toBe('oxford-shirt-3')
  })

  it('uses the fallback when the name has no Latin characters', () => {
    expect(pickUniqueSlug('পাঞ্জাবি', new Set(['product']), 'product')).toBe('product-2')
  })

  it('stays within the 120-character limit when adding a suffix', () => {
    const long = 'a'.repeat(120)
    const slug = pickUniqueSlug(long, new Set([long]), 'product')
    expect(slug).toHaveLength(120)
    expect(slug.endsWith('-2')).toBe(true)
  })
})

describe('slugPrefixOf', () => {
  it('returns the slug base for the lookup query', () => {
    expect(slugPrefixOf('Oxford Shirt', 'product')).toBe('oxford-shirt')
  })
})
