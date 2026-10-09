import type { PageLinkView, PublicPageView } from '@nowoll/types'
import { Markdown } from '@nowoll/ui'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { cache } from 'react'
import { apiGet } from '@/lib/api'
import { breadcrumbJsonLd, JsonLd } from '@/lib/json-ld'

// ============================================================================
// Static pages written in Admin → Content → Pages (step 36 part 2):
// /privacy, /terms, /return-policy, /about, /contact, /faq…
// The shop's own routes (/shop, /cart…) always win: Next.js matches them
// before this [pageSlug] route, and the admin can't choose those addresses
// (RESERVED_PAGE_SLUGS).
// ============================================================================

type Props = { params: Promise<{ pageSlug: string }> }

// ISR: an edit or (un)publish shows within a minute.
export const revalidate = 60

export async function generateStaticParams(): Promise<{ pageSlug: string }[]> {
  const pages = await apiGet<PageLinkView[]>('/pages')
  return (pages ?? []).map((p) => ({ pageSlug: p.slug }))
}

const getPage = cache((slug: string) =>
  apiGet<PublicPageView>(`/pages/${encodeURIComponent(slug)}`),
)

/** Google's description: the admin's, or the first words of the text. */
function summary(markdown: string): string | undefined {
  const text = markdown
    .replace(/<[^>]*>/g, ' ') // pasted HTML tags (never shown on the page either)
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // [words](link) → words
    .replace(/[#>*_`|-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!text) return undefined
  return text.length > 160 ? `${text.slice(0, 157).trimEnd()}…` : text
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const page = await getPage((await params).pageSlug)
  if (!page) return { title: 'Page not found' }
  return {
    title: page.seoTitle ?? page.title,
    description: page.seoDescription ?? summary(page.content),
    alternates: { canonical: `/${page.slug}` },
  }
}

export default async function StaticPage({ params }: Props) {
  const page = await getPage((await params).pageSlug)
  if (!page) notFound() // draft, archived or unknown → 404

  return (
    <article className="mx-auto max-w-3xl px-4 py-10">
      <JsonLd data={breadcrumbJsonLd([], { name: page.title, path: `/${page.slug}` })} />
      <h1 className="mb-6 text-3xl font-semibold tracking-tight">{page.title}</h1>
      <Markdown>{page.content}</Markdown>
    </article>
  )
}
