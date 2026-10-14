import type { ProductCardView } from './catalog.js'

// Blog (step 43) — apps/api/src/blog. Dates are ISO strings.

/** One card on /blog. */
export interface BlogCardView {
  slug: string
  title: string
  excerpt: string | null
  coverImageUrl: string | null
  coverImageAlt: string | null
  tags: string[]
  publishedAt: string
}

/** GET /blog?page&tag */
export interface BlogListView {
  items: BlogCardView[]
  total: number
  page: number
  pageSize: number
  totalPages: number
  /** The tag being filtered by (null = all posts). */
  tag: string | null
}

/** GET /blog/:slug — a live post (or null when draft, scheduled, archived or unknown). */
export interface BlogPostView extends BlogCardView {
  content: string
  seoTitle: string | null
  seoDescription: string | null
  updatedAt: string
  /** "Shop the look" — only products on sale right now, in the chosen order. */
  products: ProductCardView[]
}

/** GET /blog/sitemap — every live post, for /sitemap.xml. */
export interface BlogSitemapEntry {
  slug: string
  updatedAt: string
}

export type BlogStatusView = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'

/** Admin → Content → Blog list. */
export interface AdminBlogRow {
  id: string
  slug: string
  title: string
  status: BlogStatusView
  /** Set when published (or the planned date of a scheduled post). */
  publishedAt: string | null
  /** PUBLISHED with a date still to come. */
  scheduled: boolean
  updatedAt: string
}

export interface AdminBlogDetail extends AdminBlogRow {
  excerpt: string | null
  content: string
  coverImageUrl: string | null
  coverImageAlt: string | null
  tags: string[]
  seoTitle: string | null
  seoDescription: string | null
  productIds: string[]
}
