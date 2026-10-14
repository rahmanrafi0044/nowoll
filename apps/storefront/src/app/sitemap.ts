import type { MetadataRoute } from 'next'
import { sitemapEntries } from '@/lib/sitemap'

// /sitemap.xml — see lib/sitemap.ts. Rebuilt at most once an hour.
export const revalidate = 3600

export default function sitemap(): Promise<MetadataRoute.Sitemap> {
  return sitemapEntries()
}
