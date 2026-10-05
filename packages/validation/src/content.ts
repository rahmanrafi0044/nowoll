import { z } from 'zod'

// ============================================================================
// Shapes of the editable homepage content stored in content_blocks.data (JSON).
// The API checks a block against these before serving it, and the Phase 5
// admin editor will use the same schemas for its forms.
// ============================================================================

/** Internal path ("/shop/men") or full https URL. Never javascript: links. */
const linkSchema = z
  .string()
  .trim()
  .max(300)
  .refine((v) => (v.startsWith('/') ? !v.startsWith('//') : /^https:\/\//.test(v)), {
    message: 'Use a path like /shop/men or a full https:// link',
  })

export const announcementBarSchema = z.object({
  text: z.string().trim().min(1).max(120),
  href: linkSchema.nullable().default(null),
})

export const homepageHeroSchema = z.object({
  heading: z.string().trim().min(1).max(80),
  subheading: z.string().trim().max(200).nullable().default(null),
  ctaLabel: z.string().trim().min(1).max(30),
  ctaHref: linkSchema,
  imageUrl: z
    .url({ protocol: /^https$/ })
    .nullable()
    .default(null),
  imageAlt: z.string().trim().max(200).nullable().default(null),
})

/** Every block the storefront may read, by key. Unknown keys are not served. */
export const CONTENT_BLOCK_SCHEMAS = {
  announcement_bar: announcementBarSchema,
  homepage_hero: homepageHeroSchema,
} as const

export type ContentBlockKey = keyof typeof CONTENT_BLOCK_SCHEMAS
export type AnnouncementBar = z.output<typeof announcementBarSchema>
export type HomepageHero = z.output<typeof homepageHeroSchema>
