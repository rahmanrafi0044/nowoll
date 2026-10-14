import type {
  BlogSitemapEntry,
  CategoryNode,
  PageLinkView,
  Paginated,
  ProductCardView,
} from '@nowoll/types'
import type { MetadataRoute } from 'next'
import { apiGet } from '@/lib/api'
import { absoluteUrl } from '@/lib/json-ld'

// ============================================================================
// /sitemap.xml (CLAUDE.md §13, step 43): every public address Google should
// know — only what the shop SHOWS (the API's public lists already leave out
// drafts, hidden categories and unpublished pages). Built at most hourly.
// ============================================================================

const MAX_PRODUCT_PAGES = 50 // 50 × 60 = 3,000 products — plenty for one sitemap file (limit 50,000)

export async function sitemapEntries(): Promise<MetadataRoute.Sitemap> {
  const [categories, pages, posts, slugs] = await Promise.all([
    apiGet<CategoryNode[]>('/categories'),
    apiGet<PageLinkView[]>('/pages'),
    apiGet<BlogSitemapEntry[]>('/blog/sitemap'),
    productSlugs(),
  ])
  const flat = (nodes: CategoryNode[]): CategoryNode[] =>
    nodes.flatMap((n) => [n, ...flat(n.children)])

  return [
    { url: absoluteUrl('/'), changeFrequency: 'daily', priority: 1 },
    { url: absoluteUrl('/shop'), changeFrequency: 'daily', priority: 0.9 },
    ...flat(categories ?? []).map((c) => ({
      url: absoluteUrl(`/shop/${c.slug}`),
      changeFrequency: 'daily' as const,
      priority: 0.8,
    })),
    ...slugs.map((slug) => ({
      url: absoluteUrl(`/products/${slug}`),
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    })),
    ...((posts?.length ?? 0) > 0
      ? [{ url: absoluteUrl('/blog'), changeFrequency: 'weekly' as const, priority: 0.6 }]
      : []),
    ...(posts ?? []).map((p) => ({
      url: absoluteUrl(`/blog/${p.slug}`),
      lastModified: new Date(p.updatedAt),
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    })),
    ...(pages ?? []).map((p) => ({
      url: absoluteUrl(`/${p.slug}`),
      changeFrequency: 'yearly' as const,
      priority: 0.3,
    })),
  ]
}

async function productSlugs(): Promise<string[]> {
  const slugs: string[] = []
  for (let page = 1; page <= MAX_PRODUCT_PAGES; page++) {
    const result = await apiGet<Paginated<ProductCardView>>(`/products?pageSize=60&page=${page}`)
    if (!result) break
    slugs.push(...result.items.map((p) => p.slug))
    if (page >= result.totalPages) break
  }
  return slugs
}
