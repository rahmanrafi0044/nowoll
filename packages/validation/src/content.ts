import './jitless.js' // first: Zod's no-eval switch (see jitless.ts)
import * as z from 'zod'
import { emailWordingSchema } from './email-wording.js'
import { productInfoSchema } from './product-info.js'

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

const announcementMessage = z.object({
  text: z.string().trim().min(1).max(120),
  href: linkSchema.nullable().default(null),
})

/** The strip above the header. 38f: up to 3 more messages take turns with the first. */
export const announcementBarSchema = announcementMessage.extend({
  more: z.array(announcementMessage).max(3, 'At most 3 more messages').default([]),
})

/**
 * A picture: an uploaded photo (a full https:// address — Supabase), or a file
 * on this shop itself ("/perf/hero.jpg", 38f — the stand-in photos of
 * `pnpm design-preview`). Never http://, "//other-site", or javascript:.
 */
export const imageUrlSchema = z
  .string()
  .trim()
  .min(1, 'Upload a photo')
  .max(500)
  .refine(
    (v) =>
      v.startsWith('/')
        ? !v.startsWith('//') && !v.includes('\\')
        : URL.canParse(v) && new URL(v).protocol === 'https:',
    { message: 'Upload a photo (an https:// address or a file on this shop)' },
  )

const heroSlide = z.object({
  heading: z.string().trim().min(1).max(80),
  subheading: z.string().trim().max(200).nullable().default(null),
  ctaLabel: z.string().trim().min(1).max(30),
  ctaHref: linkSchema,
  imageUrl: imageUrlSchema.nullable().default(null),
  imageAlt: z.string().trim().max(200).nullable().default(null),
})

/** The homepage's first picture. 38f: up to 3 more slides take turns with it. */
export const homepageHeroSchema = heroSlide.extend({
  more: z.array(heroSlide).max(3, 'At most 3 more slides').default([]),
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
          imageUrl: imageUrlSchema,
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
  // ── Design refresh (38f) ──
  // A photo on one side, words and a button on the other.
  z.object({
    ...sectionBase,
    type: z.literal('split'),
    imageUrl: imageUrlSchema,
    imageAlt: z.string().trim().min(1, 'Describe the photo').max(200),
    heading: z.string().trim().min(1, 'Write a heading').max(80),
    text: z.string().trim().max(300).nullable().default(null),
    ctaLabel: z.string().trim().max(30).nullable().default(null),
    href: linkSchema.nullable().default(null),
    imageSide: z.enum(['left', 'right']).default('left'),
  }),
  // Round photos with a word each: "Shop by occasion".
  z.object({
    ...sectionBase,
    type: z.literal('circles'),
    title: optionalTitle,
    items: z
      .array(
        z.object({
          imageUrl: imageUrlSchema,
          imageAlt: z.string().trim().min(1, 'Describe the photo').max(200),
          label: z.string().trim().min(1, 'Write a label').max(30),
          href: linkSchema,
        }),
      )
      .min(2, 'At least 2 circles')
      .max(6, 'At most 6 circles'),
  }),
  // A few lines about the brand, with an optional photo.
  z.object({
    ...sectionBase,
    type: z.literal('story'),
    heading: z.string().trim().min(1, 'Write a heading').max(80),
    text: z.string().trim().min(1, 'Write the story').max(600),
    imageUrl: imageUrlSchema.nullable().default(null),
    imageAlt: z.string().trim().max(200).nullable().default(null),
    ctaLabel: z.string().trim().max(30).nullable().default(null),
    href: linkSchema.nullable().default(null),
  }),
  // "Spotted": photos of customers (or well-known people) wearing the brand,
  // each optionally linking to what they wear. Photos need the person's OK —
  // see the hint in the admin editor.
  z.object({
    ...sectionBase,
    type: z.literal('lookbook'),
    title: optionalTitle,
    text: z.string().trim().max(200).nullable().default(null),
    items: z
      .array(
        z.object({
          imageUrl: imageUrlSchema,
          imageAlt: z.string().trim().min(1, 'Describe the photo').max(200),
          caption: z.string().trim().max(60).nullable().default(null),
          href: linkSchema.nullable().default(null),
        }),
      )
      .min(3, 'At least 3 photos')
      .max(12, 'At most 12 photos'),
  }),
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

// ── Main menu and footer (step 38b) ──────────────────────────────────────

const itemId = z.string().trim().min(1).max(40)
const menuLabel = z.string().trim().min(1, 'Write a label').max(30, 'At most 30 letters')

/**
 * The header menu (desktop and the phone ☰ menu): an ordered, FLAT list —
 * no drop-downs (a new layout = developer-side, docs/admin-editable.md).
 * Categories are remembered by id, so renaming one or changing its address
 * keeps the menu right; a hidden or archived one simply drops out.
 */
export const menuItemSchema = z.discriminatedUnion('kind', [
  z.object({ id: itemId, kind: z.literal('shop_all'), label: menuLabel.nullable().default(null) }),
  z.object({
    id: itemId,
    kind: z.literal('category'),
    categoryId: z.uuid('Choose a category'),
    label: menuLabel.nullable().default(null),
  }),
  z.object({ id: itemId, kind: z.literal('link'), label: menuLabel, href: linkSchema }),
])

export const mainMenuSchema = z
  .object({ items: z.array(menuItemSchema).max(12, 'At most 12 menu items') })
  .refine((m) => new Set(m.items.map((i) => i.id)).size === m.items.length, {
    message: 'Each menu item needs its own id',
  })

/** Payment-method badges the footer may show — a fixed list (text badges, no outside files). */
export const PAYMENT_BADGES = [
  { key: 'cod', label: 'Cash on delivery' },
  { key: 'bkash', label: 'bKash' },
  { key: 'nagad', label: 'Nagad' },
  { key: 'rocket', label: 'Rocket' },
  { key: 'upay', label: 'Upay' },
  { key: 'visa', label: 'VISA' },
  { key: 'mastercard', label: 'Mastercard' },
  { key: 'amex', label: 'American Express' },
] as const
export type PaymentBadge = (typeof PAYMENT_BADGES)[number]['key']
const PAYMENT_BADGE_KEYS = PAYMENT_BADGES.map((b) => b.key) as [PaymentBadge, ...PaymentBadge[]]

export const footerSchema = z.object({
  /** A few plain-text lines under the store name. */
  about: z.string().trim().max(300, 'About text: at most 300 letters').default(''),
  columns: z
    .array(
      z.object({
        id: itemId,
        title: z.string().trim().min(1, 'Write a column title').max(40),
        links: z
          .array(z.object({ label: menuLabel.max(40), href: linkSchema }))
          .min(1, 'A column needs at least one link')
          .max(8, 'At most 8 links per column'),
      }),
    )
    .max(3, 'At most 3 columns')
    .default([]),
  /** List published pages (Admin → Content → Pages) automatically — today's footer. */
  autoPages: z.boolean().default(true),
  payments: z
    .array(z.enum(PAYMENT_BADGE_KEYS))
    .refine((p) => new Set(p).size === p.length, 'Each payment badge once')
    .default([]),
  /** "{year}" becomes the current year. Empty = "© 2026 <store>. All prices in BDT (৳)." */
  copyright: z.string().trim().max(120, 'Copyright: at most 120 letters').default(''),
})

/** Every block the storefront may read, by key. Unknown keys are not served. */
export const CONTENT_BLOCK_SCHEMAS = {
  announcement_bar: announcementBarSchema,
  homepage_hero: homepageHeroSchema,
  homepage_layout: homepageLayoutSchema,
  main_menu: mainMenuSchema,
  footer: footerSchema,
  product_info: productInfoSchema, // step 38d
  email_wording: emailWordingSchema, // step 43b — PRIVATE (see PRIVATE_CONTENT_BLOCKS)
} as const

/** Blocks the shop never reads — the public /content-blocks route answers null for them. */
export const PRIVATE_CONTENT_BLOCKS: readonly ContentBlockKey[] = ['email_wording']

export type ContentBlockKey = keyof typeof CONTENT_BLOCK_SCHEMAS
export type AnnouncementBar = z.output<typeof announcementBarSchema>
export type HomepageHero = z.output<typeof homepageHeroSchema>
export type HomepageSection = z.output<typeof homepageSectionSchema>
export type HomepageLayout = z.output<typeof homepageLayoutSchema>
export type TrustBadgeIcon = (typeof TRUST_BADGE_ICONS)[number]
export type MenuItem = z.output<typeof menuItemSchema>
export type MainMenu = z.output<typeof mainMenuSchema>
export type Footer = z.output<typeof footerSchema>

// ── Design refresh (38f): photo tiles inside a category's product grid ──────

/**
 * One editorial tile — a photo with a few words, placed among the products
 * ("asymmetric" look). `position`: after which product it appears (1 = after
 * the first). `wide`: two columns instead of one on tablets and computers.
 */
export const editorialTileSchema = z.object({
  imageUrl: imageUrlSchema,
  imageAlt: z.string().trim().min(1, 'Describe the photo (for screen readers and Google)').max(120),
  heading: z.string().trim().min(1, 'Write a heading').max(60, 'Heading: at most 60 letters'),
  text: z.string().trim().max(160, 'Text: at most 160 letters').nullable().default(null),
  href: linkSchema.nullable().default(null),
  position: z.int('A whole number').min(1).max(48, 'At most after product 48'),
  wide: z.boolean().default(false),
})

/** A category's tiles (Admin → Categories): at most 3. */
export const categoryEditorialSchema = z
  .array(editorialTileSchema)
  .max(3, 'At most 3 photo tiles per category')

export type EditorialTile = z.output<typeof editorialTileSchema>
