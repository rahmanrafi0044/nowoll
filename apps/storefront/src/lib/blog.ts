import type { BlogPostView } from '@nowoll/types'
import { blogPhotoSize } from '@nowoll/validation'
import { absoluteUrl } from '@/lib/json-ld'
import { publicEnv } from '@/lib/env'

// Blog helpers (step 43).

/** Our own uploads: the shop's Supabase Storage "content" folder (where the admin's photos go). */
const ownPrefix = () =>
  publicEnv.supabaseUrl
    ? `${publicEnv.supabaseUrl.replace(/\/+$/, '')}/storage/v1/object/public/`
    : null

/** A photo inside a post → address + size, only if it's one of the shop's own uploads. */
export function ownPhoto(src: string): { url: string; width: number; height: number } | null {
  const prefix = ownPrefix()
  const photo = blogPhotoSize(src)
  return prefix && photo && photo.url.startsWith(prefix) ? photo : null
}

const dayFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'Asia/Dhaka',
})
/** "14 October 2026" (Bangladesh date). */
export const postDate = (iso: string) => dayFormat.format(new Date(iso))

/** Google's description: the admin's, else the excerpt, else the first words. */
export function postSummary(p: Pick<BlogPostView, 'seoDescription' | 'excerpt' | 'content'>) {
  if (p.seoDescription) return p.seoDescription
  if (p.excerpt) return p.excerpt
  const text = p.content
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_`|-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return text.length > 160 ? `${text.slice(0, 157).trimEnd()}…` : text || undefined
}

/**
 * BlogPosting (CLAUDE.md §13): lets Google show the post with its date and
 * picture. The author is the shop, never a staff member's name (privacy).
 */
export function blogPostingJsonLd(post: BlogPostView, storeName: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: postSummary(post),
    datePublished: post.publishedAt,
    dateModified: post.updatedAt,
    mainEntityOfPage: absoluteUrl(`/blog/${post.slug}`),
    ...(post.coverImageUrl && { image: [post.coverImageUrl] }),
    ...(post.tags.length && { keywords: post.tags.join(', ') }),
    author: { '@type': 'Organization', name: storeName, url: absoluteUrl('/') },
    publisher: { '@type': 'Organization', name: storeName, url: absoluteUrl('/') },
  }
}
