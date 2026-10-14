import type { MetadataRoute } from 'next'
import { absoluteUrl } from '@/lib/json-ld'

// /robots.txt (step 43): everything public may be indexed, except personal and
// in-progress pages; points search engines at /sitemap.xml.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/account', '/cart', '/checkout', '/orders', '/newsletter', '/reset-password'],
    },
    sitemap: absoluteUrl('/sitemap.xml'),
  }
}
