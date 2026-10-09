import type { DiscountFilters } from '@/lib/discounts-api'

const STATUSES = ['ACTIVE', 'SCHEDULED', 'EXPIRED', 'USED_UP', 'OFF'] as const

/** Only known filter values pass through — anything else in the address is ignored. */
export function parseDiscountFilters(
  params: Record<string, string | string[] | undefined>,
): DiscountFilters {
  const one = (k: string) => (typeof params[k] === 'string' ? params[k] : undefined)
  const page = Number(one('page'))
  const status = one('status')
  return {
    q: one('q')?.trim().slice(0, 30) || undefined,
    status: STATUSES.find((s) => s === status),
    page: Number.isInteger(page) && page > 1 ? page : undefined,
  }
}
