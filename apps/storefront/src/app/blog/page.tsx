import type { BlogListView } from '@nowoll/types'
import type { Metadata } from 'next'
import Link from 'next/link'
import { BlogCard } from '@/components/blog/blog-card'
import { apiGet } from '@/lib/api'
import { breadcrumbJsonLd, JsonLd } from '@/lib/json-ld'
import { getSettings } from '@/lib/settings'

// /blog — the shop's posts, newest first (step 43). ?tag=eid filters, ?page=2 pages.

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : undefined)

function query(params: Record<string, string | string[] | undefined>) {
  const page = Math.max(1, Math.min(1000, Number(one(params.page)) || 1))
  const tag = one(params.tag)
  return { page, tag }
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { page, tag } = query(await searchParams)
  const s = await getSettings()
  return {
    title: tag ? `Blog: ${tag}` : 'Blog',
    description: `Stories, styling ideas and new arrivals from ${s.store_name}.`,
    // Filtered and later pages point Google at the main blog page (CLAUDE.md §13).
    alternates: { canonical: '/blog' },
    ...((tag || page > 1) && { robots: { index: false, follow: true } }),
  }
}

export default async function BlogPage({ searchParams }: Props) {
  const { page, tag } = query(await searchParams)
  const p = new URLSearchParams({ page: String(page) })
  if (tag) p.set('tag', tag)
  const list = await apiGet<BlogListView>(`/blog?${p}`)
  const items = list?.items ?? []
  const link = (n: number) => {
    const q = new URLSearchParams()
    if (list?.tag) q.set('tag', list.tag)
    if (n > 1) q.set('page', String(n))
    return `/blog${q.size ? `?${q}` : ''}`
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <JsonLd data={breadcrumbJsonLd([], { name: 'Blog', path: '/blog' })} />
      <h1 className="text-3xl font-semibold tracking-tight">Blog</h1>
      {list?.tag && (
        <p className="mt-2 text-muted-foreground">
          Posts tagged “{list.tag}” ·{' '}
          <Link href="/blog" className="underline underline-offset-4">
            All posts
          </Link>
        </p>
      )}
      {items.length === 0 ? (
        <p className="mt-8 text-muted-foreground">No posts yet — check back soon.</p>
      ) : (
        <div className="mt-8 grid gap-10 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((post, i) => (
            <BlogCard key={post.slug} post={post} priority={i < 3} />
          ))}
        </div>
      )}
      {list && list.totalPages > 1 && (
        <nav aria-label="Pages" className="mt-10 flex items-center justify-center gap-4 text-sm">
          {page > 1 && (
            <Link href={link(page - 1)} className="underline underline-offset-4">
              ← Newer posts
            </Link>
          )}
          <span className="text-muted-foreground">
            Page {page} of {list.totalPages}
          </span>
          {page < list.totalPages && (
            <Link href={link(page + 1)} className="underline underline-offset-4">
              Older posts →
            </Link>
          )}
        </nav>
      )}
    </div>
  )
}
