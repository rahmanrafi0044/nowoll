import {
  canonicalFor,
  hasActiveFilters,
  listingHref,
  parseListingParams,
  toApiQuery,
} from './listing'

describe('parseListingParams', () => {
  it('reads valid filters', () => {
    expect(
      parseListingParams({
        q: ' shirt ',
        size: 'M',
        color: 'Blue',
        minPrice: '500',
        maxPrice: '2000',
        inStock: '1',
        sort: 'price_asc',
        page: '3',
      }),
    ).toEqual({
      q: 'shirt',
      size: 'M',
      color: 'Blue',
      minPrice: 500,
      maxPrice: 2000,
      inStock: true,
      sort: 'price_asc',
      page: 3,
    })
  })

  it('ignores garbage instead of failing', () => {
    expect(
      parseListingParams({
        page: '-2',
        sort: 'cheapest',
        minPrice: 'abc',
        maxPrice: '1e9',
        inStock: 'yes',
        size: '',
      }),
    ).toEqual({
      page: 1,
      q: undefined,
      size: undefined,
      color: undefined,
      minPrice: undefined,
      maxPrice: undefined,
      inStock: undefined,
      sort: undefined,
    })
  })

  it('takes the first value when a parameter repeats, and swaps a reversed price range', () => {
    const p = parseListingParams({ size: ['S', 'M'], minPrice: '3000', maxPrice: '1000' })
    expect(p).toMatchObject({ size: 'S', minPrice: 1000, maxPrice: 3000 })
  })

  it('caps absurd page numbers', () => {
    expect(parseListingParams({ page: '999999' }).page).toBe(1)
  })
})

describe('toApiQuery', () => {
  it('maps to the API parameter names', () => {
    const qs = toApiQuery(parseListingParams({ size: 'M', inStock: '1', page: '2' }), 'men')
    expect(Object.fromEntries(new URLSearchParams(qs))).toEqual({
      category: 'men',
      size: 'M',
      inStock: 'true',
      page: '2',
      pageSize: '24',
    })
  })
})

describe('listingHref', () => {
  const params = parseListingParams({ size: 'M', sort: 'price_asc', page: '3' })

  it('changing a filter resets to page 1', () => {
    expect(listingHref('/shop/men', params, { color: 'Blue' })).toBe(
      '/shop/men?size=M&color=Blue&sort=price_asc',
    )
  })

  it('pagination keeps every filter', () => {
    expect(listingHref('/shop/men', params, { page: 4 })).toBe(
      '/shop/men?size=M&sort=price_asc&page=4',
    )
  })

  it('removing the last filter gives the clean URL', () => {
    expect(listingHref('/shop', parseListingParams({ size: 'M' }), { size: undefined })).toBe(
      '/shop',
    )
  })
})

describe('canonicalFor / hasActiveFilters', () => {
  it('drops filters but keeps the page number', () => {
    expect(canonicalFor('/shop/men', 1)).toBe('/shop/men')
    expect(canonicalFor('/shop/men', 2)).toBe('/shop/men?page=2')
  })

  it('knows when filters are active (sort and search are not filters)', () => {
    expect(hasActiveFilters(parseListingParams({ sort: 'newest', q: 'x' }))).toBe(false)
    expect(hasActiveFilters(parseListingParams({ inStock: '1' }))).toBe(true)
  })
})

describe('featured and tag (homepage "View all" links, step 36)', () => {
  it('read from the address, passed to the API, kept in links', () => {
    const p = parseListingParams({ featured: 'true', tag: ' eid ' })
    expect(p).toMatchObject({ featured: true, tag: 'eid' })
    expect(toApiQuery(p)).toContain('featured=true')
    expect(toApiQuery(p)).toContain('tag=eid')
    expect(listingHref('/shop', p, { sort: 'newest' })).toBe(
      '/shop?featured=true&tag=eid&sort=newest',
    )
    expect(parseListingParams({ featured: 'yes' }).featured).toBeUndefined()
  })
})

describe('shop-page defaults from Admin → Settings (step 38)', () => {
  it('products per page and the default sort; a picked sort or a search wins', () => {
    const d = { pageSize: 36, sort: 'price_asc' as const }
    expect(toApiQuery(parseListingParams({}), undefined, d)).toBe(
      'sort=price_asc&page=1&pageSize=36',
    )
    expect(toApiQuery(parseListingParams({ sort: 'newest' }), undefined, d)).toContain(
      'sort=newest',
    )
    expect(toApiQuery(parseListingParams({ q: 'shirt' }), undefined, d)).not.toContain('sort=')
    expect(toApiQuery(parseListingParams({}))).toBe('page=1&pageSize=24') // no settings → today's
  })
})
