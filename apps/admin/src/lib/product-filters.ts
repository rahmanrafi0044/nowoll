import type { ProductFilters } from '@/lib/products-api'

// The product list's filters come from the page address (?status=DRAFT&page=2).
const STATUSES = ['DRAFT', 'ACTIVE', 'ARCHIVED', 'all'] as const
const SORTS = ['updated', 'newest', 'name', 'price_asc', 'price_desc'] as const

/** Only known filter values pass through — anything else in the address is ignored. */
export function parseFilters(
  params: Record<string, string | string[] | undefined>,
): ProductFilters {
  const one = (k: string) => (typeof params[k] === 'string' ? params[k] : undefined)
  const page = Number(one('page'))
  const status = one('status')
  const sort = one('sort')
  return {
    q: one('q')?.trim().slice(0, 100) || undefined,
    status: STATUSES.find((s) => s === status),
    categoryId: /^[0-9a-f-]{36}$/i.test(one('categoryId') ?? '') ? one('categoryId') : undefined,
    lowStock: one('lowStock') === 'true' || undefined,
    sort: SORTS.find((s) => s === sort),
    page: Number.isInteger(page) && page > 1 ? page : undefined,
  }
}
