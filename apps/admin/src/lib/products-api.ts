import type {
  AdminProductList,
  BulkProductAction,
  BulkProductResult,
  ProductImportSummary,
} from '@nowoll/types'
import { call, download } from '@/lib/api'

// Products in the admin panel (step 30a) — apps/api/src/products.

export interface ProductFilters {
  q?: string
  status?: 'DRAFT' | 'ACTIVE' | 'ARCHIVED' | 'all'
  categoryId?: string
  lowStock?: boolean
  sort?: 'updated' | 'newest' | 'name' | 'price_asc' | 'price_desc'
  page?: number
}

export function fetchProducts(filters: ProductFilters) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(filters))
    if (value !== undefined && value !== '' && value !== false) params.set(key, String(value))
  return call<AdminProductList>('GET', `/admin/products?${params}`)
}

export const bulkProducts = (action: BulkProductAction, ids: string[]) =>
  call<BulkProductResult>('POST', '/admin/products/bulk', { action, ids })

/** For the category filter: the shop's category tree. */
export interface CategoryNode {
  id: string
  name: string
  children?: CategoryNode[]
}
export const fetchCategories = () => call<CategoryNode[]>('GET', '/categories')

export const exportProductsCsv = () => download('/products/export', 'nowoll-products.csv')

/** dryRun: true checks the file and reports what WOULD change — nothing is saved. */
export function importProductsCsv(file: File, dryRun: boolean) {
  const form = new FormData()
  form.append('file', file)
  return call<ProductImportSummary>('POST', `/products/import?dryRun=${dryRun}`, form)
}
