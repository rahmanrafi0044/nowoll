import type { AdminBlogDetail, AdminBlogRow, BlogStatusView } from '@nowoll/types'
import { call } from '@/lib/api'

// Admin → Content → Blog (step 43) — apps/api/src/blog.

export interface BlogFields {
  title: string
  slug: string
  excerpt: string | null
  content: string
  coverImageUrl: string | null
  coverImageAlt: string | null
  tags: string[]
  seoTitle: string | null
  seoDescription: string | null
  productIds: string[]
  /** ISO date; a future date with PUBLISHED = scheduled. null = "now" when publishing. */
  publishedAt: string | null
}

/** No status → drafts and published; 'ARCHIVED' → the archive. */
export const fetchBlogPosts = (status?: BlogStatusView) =>
  call<AdminBlogRow[]>('GET', `/admin/blog${status ? `?status=${status}` : ''}`)

export const fetchBlogPost = (id: string) => call<AdminBlogDetail>('GET', `/admin/blog/${id}`)

export const createBlogPost = (body: BlogFields & { status: 'DRAFT' | 'PUBLISHED' }) =>
  call<AdminBlogDetail>('POST', '/admin/blog', body)

export const updateBlogPost = (id: string, body: BlogFields & { status?: 'DRAFT' | 'PUBLISHED' }) =>
  call<AdminBlogDetail>('PATCH', `/admin/blog/${id}`, body)

/** Archive (soft): hidden from the shop, restorable. */
export const archiveBlogPost = (id: string) => call<AdminBlogDetail>('DELETE', `/admin/blog/${id}`)
