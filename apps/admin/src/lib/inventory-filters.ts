import type { InventoryFilters } from '@/lib/inventory-api'

// The inventory list's filters come from the page address (?stock=out&sort=name).
const SORTS = ['stock_asc', 'stock_desc', 'name'] as const

/** Only known filter values pass through — anything else in the address is ignored. */
export function parseInventoryFilters(
  params: Record<string, string | string[] | undefined>,
): InventoryFilters {
  const one = (k: string) => (typeof params[k] === 'string' ? params[k] : undefined)
  const page = Number(one('page'))
  const sort = one('sort')
  const category = one('category')
  return {
    q: one('q')?.trim().slice(0, 100) || undefined,
    category: category && /^[a-z0-9-]{1,120}$/.test(category) ? category : undefined,
    stock: one('stock') === 'out' ? 'out' : undefined,
    sort: SORTS.find((s) => s === sort && s !== 'stock_asc'),
    page: Number.isInteger(page) && page > 1 ? page : undefined,
  }
}
