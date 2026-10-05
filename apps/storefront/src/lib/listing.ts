// ============================================================================
// Listing-page URL handling: /shop?size=M&sort=price_asc&page=2
// Pure functions (no React), so the rules are easy to test.
//
// Customers can type anything into the address bar, so invalid values are
// IGNORED (treated as "no filter"), never shown as an error page.
// ============================================================================

export const SORTS = [
  { value: 'newest', label: 'Newest' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
] as const
export type SortValue = (typeof SORTS)[number]['value'] | 'relevance'

export const PAGE_SIZE = 24

export interface ListingParams {
  q?: string
  size?: string
  color?: string
  minPrice?: number
  maxPrice?: number
  inStock?: boolean
  sort?: SortValue
  page: number
}

type RawSearchParams = Record<string, string | string[] | undefined>

const first = (v: string | string[] | undefined) =>
  (Array.isArray(v) ? v[0] : v)?.trim() || undefined

const price = (v: string | undefined) => {
  if (v === undefined || !/^\d+(\.\d{1,2})?$/.test(v)) return undefined
  return Number(v)
}

export function parseListingParams(raw: RawSearchParams): ListingParams {
  const q = first(raw.q)?.slice(0, 100)
  const sortRaw = first(raw.sort)
  const sort = [...SORTS.map((s) => s.value), 'relevance'].includes(sortRaw ?? '')
    ? (sortRaw as SortValue)
    : undefined
  const pageNum = Number(first(raw.page))
  let minPrice = price(first(raw.minPrice))
  let maxPrice = price(first(raw.maxPrice))
  if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) {
    ;[minPrice, maxPrice] = [maxPrice, minPrice] // forgive a swapped range
  }

  return {
    q,
    size: first(raw.size)?.slice(0, 30),
    color: first(raw.color)?.slice(0, 40),
    minPrice,
    maxPrice,
    inStock: first(raw.inStock) === '1' ? true : undefined,
    sort,
    page: Number.isInteger(pageNum) && pageNum >= 1 && pageNum <= 1000 ? pageNum : 1,
  }
}

/** The query string the API understands for this listing. */
export function toApiQuery(params: ListingParams, category?: string): string {
  const qs = new URLSearchParams()
  if (category) qs.set('category', category)
  if (params.q) qs.set('q', params.q)
  if (params.size) qs.set('size', params.size)
  if (params.color) qs.set('color', params.color)
  if (params.minPrice !== undefined) qs.set('minPrice', String(params.minPrice))
  if (params.maxPrice !== undefined) qs.set('maxPrice', String(params.maxPrice))
  if (params.inStock) qs.set('inStock', 'true')
  if (params.sort) qs.set('sort', params.sort)
  qs.set('page', String(params.page))
  qs.set('pageSize', String(PAGE_SIZE))
  return qs.toString()
}

/**
 * A link to the same listing with some params changed — used by pagination,
 * sort and "remove filter" chips. Changing anything but the page resets to page 1.
 */
export function listingHref(
  basePath: string,
  params: ListingParams,
  changes: Partial<ListingParams> = {},
): string {
  const next: ListingParams = { ...params, ...changes }
  if (!('page' in changes)) next.page = 1
  const qs = new URLSearchParams()
  if (next.q) qs.set('q', next.q)
  if (next.size) qs.set('size', next.size)
  if (next.color) qs.set('color', next.color)
  if (next.minPrice !== undefined) qs.set('minPrice', String(next.minPrice))
  if (next.maxPrice !== undefined) qs.set('maxPrice', String(next.maxPrice))
  if (next.inStock) qs.set('inStock', '1')
  if (next.sort) qs.set('sort', next.sort)
  if (next.page > 1) qs.set('page', String(next.page))
  const s = qs.toString()
  return s ? `${basePath}?${s}` : basePath
}

/**
 * SEO (CLAUDE.md §13): every filtered/sorted variant of a listing points
 * search engines at ONE canonical URL — the plain listing, plus ?page=N for
 * later pages (those hold different products, so they stay indexable).
 */
export function canonicalFor(basePath: string, page: number): string {
  return page > 1 ? `${basePath}?page=${page}` : basePath
}

export function hasActiveFilters(p: ListingParams): boolean {
  return Boolean(
    p.size || p.color || p.minPrice !== undefined || p.maxPrice !== undefined || p.inStock,
  )
}
