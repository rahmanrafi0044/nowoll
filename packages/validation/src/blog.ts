import './jitless.js' // first: Zod's no-eval switch (see jitless.ts)
import * as z from 'zod'
import { SLUG_PATTERN } from './schemas.js'

// ============================================================================
// Blog posts (step 43). Written in Markdown in Admin → Content → Blog, checked
// by the API with these rules, shown at /blog/<slug>. Same safety as static
// pages (no pasted HTML — CLAUDE.md Rule 9), plus PHOTOS inside a post — but
// only photos uploaded through the admin, never an address from elsewhere.
// ============================================================================

export const BLOG_SLUG_MAX = 80
export const BLOG_CONTENT_MAX = 30_000 // like pages: ~90 KB of Bangla, inside the 100 KB request limit
export const BLOG_MAX_TAGS = 10
export const BLOG_MAX_PRODUCTS = 4 // "Shop the look"
export const BLOG_PAGE_SIZE = 12

export const blogSlugSchema = z
  .string()
  .trim()
  .min(1, 'Write a web address')
  .max(BLOG_SLUG_MAX, `At most ${BLOG_SLUG_MAX} letters`)
  .regex(SLUG_PATTERN, 'Use lowercase letters, numbers and single hyphens only')

/** A tag: "eid", "summer-2026" — lowercase, so "Eid" and "eid" are one tag. */
export const blogTagSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1)
  .max(30, 'A tag is at most 30 letters')
  .regex(SLUG_PATTERN, 'Tags: lowercase letters, numbers and hyphens (e.g. eid-collection)')

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `At most ${max} letters`)
    .nullable()
    .default(null)
    .transform((v) => v || null) // "" → null

/** One post as the admin saves it (the photo-address rule needs the server — see blogPhotoProblem). */
export const blogInputSchema = z
  .object({
    title: z.string().trim().min(1, 'Write a title').max(120, 'At most 120 letters'),
    slug: blogSlugSchema,
    excerpt: optionalText(300),
    content: z.string().max(BLOG_CONTENT_MAX, `At most ${BLOG_CONTENT_MAX} letters`),
    coverImageUrl: optionalText(500),
    coverImageAlt: optionalText(200),
    tags: z
      .array(blogTagSchema)
      .max(BLOG_MAX_TAGS, `At most ${BLOG_MAX_TAGS} tags`)
      .default([])
      .transform((t) => [...new Set(t)]),
    seoTitle: optionalText(70),
    seoDescription: optionalText(160),
    productIds: z
      .array(z.uuid('Choose products from the list'))
      .max(BLOG_MAX_PRODUCTS, `At most ${BLOG_MAX_PRODUCTS} products`)
      .default([])
      .refine((ids) => new Set(ids).size === ids.length, 'Each product once'),
  })
  // Accessibility: a cover photo needs words for people who can't see it.
  .refine((p) => !p.coverImageUrl || !!p.coverImageAlt, {
    path: ['coverImageAlt'],
    message: 'Describe the cover photo (for people using screen readers)',
  })
export type BlogInput = z.infer<typeof blogInputSchema>

// ── Photos inside a post ───────────────────────────────────────────────────

/**
 * A photo address inside a post carries its size after a "#", added by the
 * editor's "Insert photo": …/content/<id>.jpg#w=1200&h=800 — so the shop can
 * reserve the space (no jumping page) without downloading it first.
 */
export function blogPhotoSize(src: string): { url: string; width: number; height: number } | null {
  const m = /^(https:\/\/[^#\s]+)#w=(\d{1,5})&h=(\d{1,5})$/.exec(src.trim())
  if (!m) return null
  const width = Number(m[2])
  const height = Number(m[3])
  if (width < 1 || height < 1) return null
  return { url: m[1]!, width, height }
}

/** Every photo address in the Markdown: ![description](address) — with or without a "title". */
export function markdownPhotoSources(markdown: string): string[] {
  return [...markdown.matchAll(/!\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)].map(
    (m) => m[1]!,
  )
}

/**
 * Why the post's photos can't be saved, or null if they're fine. Only photos
 * uploaded through the admin (their address starts with `ownPrefix`, our
 * storage folder) with the size the editor adds. `ownPrefix` comes from the
 * server, so the rule can't be loosened from a browser.
 */
export function blogPhotoProblem(
  post: { content: string; coverImageUrl: string | null },
  ownPrefix: string,
): string | null {
  if (post.coverImageUrl && !post.coverImageUrl.startsWith(ownPrefix))
    return 'Upload the cover photo here — photos from other websites are not allowed.'
  for (const src of markdownPhotoSources(post.content)) {
    const photo = blogPhotoSize(src)
    if (!photo || !photo.url.startsWith(ownPrefix))
      return 'Use "Insert photo" for photos in the post — photos from other websites are not allowed.'
  }
  return null
}

/** Is this post visible in the shop right now? (Published, and its date has come.) */
export const isBlogPostLive = (
  p: { status: string; publishedAt: Date | string | null },
  now: Date,
) => p.status === 'PUBLISHED' && !!p.publishedAt && new Date(p.publishedAt) <= now
