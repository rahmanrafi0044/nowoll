import type { BreadcrumbItem } from '@nowoll/types'
import { publicEnv } from '@/lib/env'

/**
 * Structured data for search engines (CLAUDE.md §13). JSON goes inside a
 * <script>, so "<" is escaped — no text (a product name, say) can ever close
 * the script tag early and inject HTML (an XSS precaution).
 */
export function JsonLd({ data }: { data: object }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }}
    />
  )
}

const absolute = (path: string) => new URL(path, publicEnv.siteUrl).toString()

/** BreadcrumbList: Home › Men › Shirts (› product). Lets Google show the path in results. */
export function breadcrumbJsonLd(trail: BreadcrumbItem[], last?: { name: string; path: string }) {
  const items = [
    { name: 'Home', path: '/' },
    ...trail.map((c) => ({ name: c.name, path: `/shop/${c.slug}` })),
    ...(last ? [last] : []),
  ]
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: absolute(item.path),
    })),
  }
}

export { absolute as absoluteUrl }
