import type {
  AdminProductDetail,
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

// ── One product: create and edit (step 30b) ──────────────────────────────

export const fetchProduct = (id: string) => call<AdminProductDetail>('GET', `/admin/products/${id}`)

/** The editable product fields, as the API takes them (prices as numbers). */
export interface ProductFields {
  name: string
  slug: string
  categoryId: string
  basePrice: number
  compareAtPrice: number | null
  shortDescription: string | null
  description: string | null
  tags: string[]
  isFeatured: boolean
  seoTitle: string | null
  seoDescription: string | null
  status: 'DRAFT' | 'ACTIVE'
}

/** New products always start as DRAFT (API rule). */
export const createProduct = (body: Pick<ProductFields, 'name' | 'categoryId' | 'basePrice'>) =>
  call<{ id: string }>('POST', '/products', body)

export const updateProduct = (id: string, body: Partial<ProductFields>) =>
  call<{ id: string }>('PATCH', `/products/${id}`, body)

/** Archive = soft delete: hidden everywhere, kept for order history. */
export const archiveProduct = (id: string) => call<{ id: string }>('DELETE', `/products/${id}`)

export interface VariantFields {
  sku: string
  size: string
  color: string
  colorHex: string | null
  price: number | null
  compareAtPrice: number | null
  lowStockThreshold: number | null
  isActive: boolean
  /** Starting stock — only when the variant is created. */
  stock: number
}

export const createVariant = (productId: string, body: Partial<VariantFields>) =>
  call<{ id: string }>('POST', `/variants/product/${productId}`, body)

export const updateVariant = (id: string, body: Partial<Omit<VariantFields, 'stock'>>) =>
  call<{ id: string }>('PATCH', `/variants/${id}`, body)

export const deleteVariant = (id: string) => call<{ id: string }>('DELETE', `/variants/${id}`)

export function uploadImage(
  productId: string,
  file: File,
  fields: { altText: string; variantId: string | null },
) {
  const form = new FormData()
  form.append('file', file)
  form.append('altText', fields.altText)
  if (fields.variantId) form.append('variantId', fields.variantId)
  return call<{ id: string }>('POST', `/products/${productId}/images`, form)
}

export const updateImage = (
  productId: string,
  imageId: string,
  body: { altText?: string; variantId?: string | null; sortOrder?: number },
) => call<{ id: string }>('PATCH', `/products/${productId}/images/${imageId}`, body)

export const deleteImage = (productId: string, imageId: string) =>
  call<{ id: string }>('DELETE', `/products/${productId}/images/${imageId}`)
