import type { AdminPageDetail, AdminPageRow, PageStatus } from '@nowoll/types'
import { call } from '@/lib/api'

// Admin → Content → Pages (step 36 part 2) — apps/api/src/pages.

export interface PageFields {
  title: string
  slug: string
  content: string
  seoTitle: string | null
  seoDescription: string | null
}

/** No status → drafts and published; 'ARCHIVED' → the archive. */
export const fetchPages = (status?: PageStatus) =>
  call<AdminPageRow[]>('GET', `/admin/pages${status ? `?status=${status}` : ''}`)

export const fetchPage = (id: string) => call<AdminPageDetail>('GET', `/admin/pages/${id}`)

export const createPage = (body: PageFields & { status: 'DRAFT' | 'PUBLISHED' }) =>
  call<AdminPageDetail>('POST', '/admin/pages', body)

/** Any fields; status DRAFT/PUBLISHED publishes, unpublishes or restores. */
export const updatePage = (
  id: string,
  body: Partial<PageFields> & { status?: 'DRAFT' | 'PUBLISHED' },
) => call<AdminPageDetail>('PATCH', `/admin/pages/${id}`, body)

/** Archive (soft): hidden from the shop, restorable. */
export const archivePage = (id: string) => call<AdminPageDetail>('DELETE', `/admin/pages/${id}`)

/** Adds the six starter pages (as drafts) whose addresses are still free. */
export const addStarterPages = () => call<{ created: string[] }>('POST', '/admin/pages/starter')
