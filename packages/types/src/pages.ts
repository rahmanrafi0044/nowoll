// ============================================================================
// Static pages (step 36 part 2): Privacy, Terms, Return policy, About, FAQ…
// Written in Markdown in Admin → Content → Pages; shown on the shop at /<slug>.
// ============================================================================

export type PageStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'

/** A published page in the footer. */
export interface PageLinkView {
  slug: string
  title: string
}

/** A published page on the shop. */
export interface PublicPageView {
  slug: string
  title: string
  /** Markdown — rendered by @nowoll/ui's <Markdown> (no HTML, safe links). */
  content: string
  seoTitle: string | null
  seoDescription: string | null
  updatedAt: string
}

export interface AdminPageRow {
  id: string
  slug: string
  title: string
  status: PageStatus
  createdAt: string
  updatedAt: string
}

export interface AdminPageDetail extends AdminPageRow {
  content: string
  seoTitle: string | null
  seoDescription: string | null
}
