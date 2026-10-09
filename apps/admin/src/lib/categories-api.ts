import type { AdminArchivedCategory, AdminCategoryNode } from '@nowoll/types'
import { call } from '@/lib/api'

// Admin → Categories (step 36b). Create / edit / archive use the original
// /categories routes (admin-only); the tree, order and restore are /admin/categories.

export interface CategoryFields {
  name: string
  /** Leave out on create → made from the name. */
  slug?: string
  parentId: string | null
  description: string | null
  imageUrl: string | null
  imageAlt: string | null
  sizeGuide: string | null
  isActive: boolean
  seoTitle: string | null
  seoDescription: string | null
}

/** One category as the API returns it after create / edit. */
export interface SavedCategory {
  id: string
  slug: string
}

export const fetchCategoryTree = () => call<AdminCategoryNode[]>('GET', '/admin/categories')

export const fetchArchivedCategories = () =>
  call<AdminArchivedCategory[]>('GET', '/admin/categories?archived=1')

export const createCategory = (body: CategoryFields) =>
  call<SavedCategory>('POST', '/categories', body)

export const updateCategory = (id: string, body: Partial<CategoryFields>) =>
  call<SavedCategory>('PATCH', `/categories/${id}`, body)

/** Soft delete. Refused (409) while it still has products or subcategories. */
export const archiveCategory = (id: string) => call<{ id: string }>('DELETE', `/categories/${id}`)

/** Comes back HIDDEN (switch it on when ready). */
export const restoreCategory = (id: string) =>
  call<SavedCategory>('POST', `/admin/categories/${id}/restore`)

/** The new order of one group of sister categories (parentId null = top level). */
export const reorderCategories = (parentId: string | null, ids: string[]) =>
  call<{ ids: string[] }>('PATCH', '/admin/categories/order', { parentId, ids })

/** Finds one category anywhere in the tree. */
export function findCategory(
  nodes: AdminCategoryNode[],
  id: string,
): AdminCategoryNode | undefined {
  for (const n of nodes) {
    if (n.id === id) return n
    const found = findCategory(n.children, id)
    if (found) return found
  }
  return undefined
}
