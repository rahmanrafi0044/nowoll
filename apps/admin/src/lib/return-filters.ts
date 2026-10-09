import type { ReturnFilters } from '@/lib/returns-api'

const STATUSES = ['REQUESTED', 'APPROVED', 'RECEIVED', 'REFUNDED', 'REJECTED'] as const

/**
 * The returns list's filters from the page address. With no status at all
 * the list opens on "To decide" — the work waiting; `status=all` shows everything.
 */
export function parseReturnFilters(
  params: Record<string, string | string[] | undefined>,
): ReturnFilters & { all: boolean } {
  const one = (k: string) => (typeof params[k] === 'string' ? params[k] : undefined)
  const page = Number(one('page'))
  const status = one('status')
  const q = one('q')?.trim().slice(0, 20) || undefined
  const all = status === 'all' || (status === undefined && q !== undefined) // a search looks everywhere
  return {
    status: all ? undefined : (STATUSES.find((s) => s === status) ?? 'REQUESTED'),
    q,
    page: Number.isInteger(page) && page > 1 ? page : undefined,
    all,
  }
}
