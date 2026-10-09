import { z } from 'zod'
import { SLUG_PATTERN } from './schemas.js'

// ============================================================================
// Static pages (step 36 part 2): Privacy, Terms, Return policy, About, FAQ…
// The admin writes them in Markdown; the API checks them with these rules and
// the storefront serves them at /<slug> (e.g. /privacy).
// ============================================================================

/**
 * Addresses a page may NOT use — the storefront's own routes (and ones planned
 * in the spec). Pages live at the top level (/privacy), so without this list a
 * page called "cart" could hide the real cart. A storefront test checks that
 * every top-level route folder is listed here.
 */
export const RESERVED_PAGE_SLUGS = [
  'account',
  'admin',
  'api',
  'blog',
  'cart',
  'categories',
  'checkout',
  'collections',
  'forgot-password',
  'login',
  'logout',
  'newsletter',
  'orders',
  'pages',
  'products',
  'register',
  'reset-password',
  'search',
  'shop',
  'sitemap',
  'robots',
  'track',
  'wishlist',
] as const

export const PAGE_SLUG_MAX = 60
// 30,000 letters: a Bangla page that long is ~90 KB, inside the API's 100 KB request limit.
export const PAGE_CONTENT_MAX = 30_000

export const pageSlugSchema = z
  .string()
  .trim()
  .min(1, 'Write a web address')
  .max(PAGE_SLUG_MAX, `At most ${PAGE_SLUG_MAX} letters`)
  .regex(SLUG_PATTERN, 'Use lowercase letters, numbers and single hyphens only')
  .refine((s) => !(RESERVED_PAGE_SLUGS as readonly string[]).includes(s), {
    message: 'The shop already uses this address — choose another',
  })

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `At most ${max} letters`)
    .nullable()
    .default(null)
    .transform((v) => v || null) // "" → null

/** One page as the admin saves it. */
export const pageInputSchema = z.object({
  title: z.string().trim().min(1, 'Write a title').max(80, 'At most 80 letters'),
  slug: pageSlugSchema,
  content: z.string().max(PAGE_CONTENT_MAX, `At most ${PAGE_CONTENT_MAX} letters`),
  seoTitle: optionalText(70),
  seoDescription: optionalText(160),
})
export type PageInput = z.infer<typeof pageInputSchema>

/**
 * Which links inside a page's text are kept: pages on this shop ("/shop/men"),
 * https links, email and phone links. Anything else (javascript:, data:, http:)
 * is dropped — the words stay, the link goes. Used by the Markdown renderer.
 */
export function safeMarkdownHref(href: string): string | null {
  const h = href.trim()
  if (h.startsWith('/')) return h.startsWith('//') ? null : h
  if (h.startsWith('#')) return h
  return /^(https:\/\/|mailto:|tel:)/i.test(h) ? h : null
}
