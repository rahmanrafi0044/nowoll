import type { CustomerFilters } from '@/lib/customers-api'

// The customer list's filters come from the page address (?status=BANNED&sort=spent).
const SORTS = ['newest', 'spent', 'orders', 'name'] as const

/** Only known filter values pass through — anything else in the address is ignored. */
export function parseCustomerFilters(
  params: Record<string, string | string[] | undefined>,
): CustomerFilters {
  const one = (k: string) => (typeof params[k] === 'string' ? params[k] : undefined)
  const page = Number(one('page'))
  const status = one('status')
  const sort = one('sort')
  return {
    q: one('q')?.trim().slice(0, 100) || undefined,
    status: status === 'ACTIVE' || status === 'BANNED' ? status : undefined,
    sort: SORTS.find((s) => s === sort && s !== 'newest'),
    page: Number.isInteger(page) && page > 1 ? page : undefined,
  }
}
