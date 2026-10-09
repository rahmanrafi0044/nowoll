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

// ── Homepage builder (step 36) ────────────────────────────────────────────
// The homepage is an ORDERED list of sections. Each section has a type and
// only the fields that type needs. Pictures must be https (our uploads are).

const sectionBase = {
  /** Stable id so the editor can move sections around (any short text). */
  id: z.string().trim().min(1).max(40),
  visible: z.boolean().default(true),
}
const optionalTitle = z.string().trim().max(60).nullable().default(null)
const httpsImage = z.url({ protocol: /^https$/ })

/** The fixed set of trust-badge icons (drawn by the storefront — no uploads, no HTML). */
export const TRUST_BADGE_ICONS = ['truck', 'cash', 'return', 'shield', 'phone', 'star'] as const

export const homepageSectionSchema = z.discriminatedUnion('type', [
  z.object({ ...sectionBase, type: z.literal('hero') }),
  z.object({ ...sectionBase, type: z.literal('categories'), title: optionalTitle }),
  z.object({ ...sectionBase, type: z.literal('featured'), title: optionalTitle }),
  z.object({ ...sectionBase, type: z.literal('new_arrivals'), title: optionalTitle }),
  z.object({
    ...sectionBase,
    type: z.literal('products'),
    title: z.string().trim().min(1).max(60),
    /** Products from ONE category (by its web address) or with ONE tag. */
    source: z.discriminatedUnion('kind', [
      z.object({
        kind: z.literal('category'),
        slug: z
          .string()
          .trim()
          .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
          .max(120),
      }),
      z.object({ kind: z.literal('tag'), tag: z.string().trim().min(1).max(30) }),
    ]),
    limit: z.number().int().min(4).max(12).default(8),
  }),
  z.object({
    ...sectionBase,
    type: z.literal('banners'),
    banners: z
      .array(
        z.object({
          imageUrl: httpsImage,
          imageAlt: z.string().trim().min(1).max(200),
          text: z.string().trim().max(80).nullable().default(null),
          href: linkSchema.nullable().default(null),
        }),
      )
      .min(1)
      .max(3),
  }),
  z.object({
    ...sectionBase,
    type: z.literal('trust_badges'),
    badges: z
      .array(z.object({ icon: z.enum(TRUST_BADGE_ICONS), text: z.string().trim().min(1).max(40) }))
      .min(1)
      .max(4),
  }),
  z.object({ ...sectionBase, type: z.literal('newsletter') }),
])

/** What the admin SAVES: every section must be valid, at most 20, ids unique. */
export const homepageLayoutSchema = z
  .object({ sections: z.array(homepageSectionSchema).max(20) })
  .refine((l) => new Set(l.sections.map((s) => s.id)).size === l.sections.length, {
    message: 'Each section needs its own id',
  })

/** Today's homepage — used whenever no layout has been saved yet. */
export const DEFAULT_HOMEPAGE_LAYOUT: HomepageLayout = {
  sections: [
    { id: 'hero', type: 'hero', visible: true },
    { id: 'categories', type: 'categories', visible: true, title: null },
    { id: 'featured', type: 'featured', visible: true, title: null },
    { id: 'new-arrivals', type: 'new_arrivals', visible: true, title: null },
    { id: 'newsletter', type: 'newsletter', visible: true },
  ],
}

/**
 * What the storefront SHOWS: each section checked on its own, so one broken
 * section (e.g. edited directly in the database) hides only itself. Not an
 * object with a sections array at all → today's default homepage.
 */
export function readHomepageLayout(data: unknown): HomepageLayout {
  const raw = (data as { sections?: unknown } | null)?.sections
  if (!Array.isArray(raw)) return DEFAULT_HOMEPAGE_LAYOUT
  const sections: HomepageSection[] = []
  for (const item of raw.slice(0, 20)) {
    const parsed = homepageSectionSchema.safeParse(item)
    if (parsed.success && !sections.some((s) => s.id === parsed.data.id)) sections.push(parsed.data)
  }
  return { sections }
}

/** Every block the storefront may read, by key. Unknown keys are not served. */
export const CONTENT_BLOCK_SCHEMAS = {
  announcement_bar: announcementBarSchema,
  homepage_hero: homepageHeroSchema,
  homepage_layout: homepageLayoutSchema,
} as const

export type ContentBlockKey = keyof typeof CONTENT_BLOCK_SCHEMAS
export type AnnouncementBar = z.output<typeof announcementBarSchema>
export type HomepageHero = z.output<typeof homepageHeroSchema>
export type HomepageSection = z.output<typeof homepageSectionSchema>
export type HomepageLayout = z.output<typeof homepageLayoutSchema>
export type TrustBadgeIcon = (typeof TRUST_BADGE_ICONS)[number]
