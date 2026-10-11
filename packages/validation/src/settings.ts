import { z } from 'zod'
import { bdPhoneSchema, emailSchema } from './schemas.js'

// ============================================================================
// Store settings (step 38, part 1): the shop's details and business rules,
// edited in Admin → Settings and stored one row per key in `settings`
// (CLAUDE.md Rule 6 — never in code). The API checks every change with
// SETTINGS_SCHEMA; readers use readSettings(), which falls back to the
// default for any missing or broken value — a bad setting never breaks a page.
// Developer-side on purpose (docs/admin-editable.md): the currency (BDT) and
// the email SENDER address (tied to the email domain's DNS).
// ============================================================================

const text = (max: number) => z.string().trim().max(max, `At most ${max} letters`)

/** Empty, or a valid email (stored lowercased). */
const optionalEmail = z
  .string()
  .trim()
  .refine((v) => v === '' || emailSchema.safeParse(v).success, 'Enter a valid email address')
  .transform((v) => (v === '' ? '' : emailSchema.parse(v)))

/** Empty, or a Bangladeshi mobile number (stored as +8801…). */
const optionalPhone = z
  .string()
  .trim()
  .refine(
    (v) => v === '' || bdPhoneSchema.safeParse(v).success,
    'Enter a Bangladeshi mobile number, e.g. 01712345678',
  )
  .transform((v) => (v === '' ? '' : bdPhoneSchema.parse(v)))

/** Is this an https link to one of these sites (or their subdomains, e.g. m.facebook.com)? */
export function isLinkOn(url: string, domains: readonly string[]): boolean {
  try {
    const u = new URL(url)
    const host = u.hostname.toLowerCase()
    return u.protocol === 'https:' && domains.some((d) => host === d || host.endsWith(`.${d}`))
  } catch {
    return false
  }
}

export const SOCIAL_SITES = {
  social_facebook: { label: 'Facebook', domains: ['facebook.com', 'fb.com'] },
  social_instagram: { label: 'Instagram', domains: ['instagram.com'] },
  social_tiktok: { label: 'TikTok', domains: ['tiktok.com'] },
  social_youtube: { label: 'YouTube', domains: ['youtube.com', 'youtu.be'] },
} as const

/** Empty, or an https link on that site only — never a look-alike (phishing) site. */
const social = (key: keyof typeof SOCIAL_SITES) =>
  z
    .string()
    .trim()
    .refine(
      (v) => v === '' || isLinkOn(v, SOCIAL_SITES[key].domains),
      `Use the https:// link of your page on ${SOCIAL_SITES[key].domains[0]}`,
    )

// ── The look (step 38, part 2) ───────────────────────────────────────────

/** Empty, or an https picture link (the API also requires it to be one of OUR uploads). */
const optionalImage = z
  .string()
  .trim()
  .refine((v) => {
    if (v === '') return true
    try {
      return new URL(v).protocol === 'https:'
    } catch {
      return false
    }
  }, 'Upload a picture (JPEG, PNG or WebP)')

/** sRGB "relative luminance" (WCAG) of a #rrggbb colour: 0 = black, 1 = white. */
export function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** How readable white text is on this colour (WCAG: 4.5 or more for normal text). */
export const contrastWithWhite = (hex: string) => 1.05 / (luminance(hex) + 0.05)

export const MIN_CONTRAST = 4.5

/**
 * The brand colour: buttons (white text on it), borders and the keyboard
 * focus outline. Must be readable with white text — light colours (yellow,
 * pale pink) are refused. Stored as a checked "#rrggbb", so nothing but a
 * colour can ever reach the page's styles.
 */
const brandColor = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^#[0-9a-f]{6}$/, 'A colour like #1e3a8a')
  .refine(
    (v) => contrastWithWhite(v) >= MIN_CONTRAST,
    'Too light — white text on it would be hard to read. Choose a darker colour.',
  )

/** Ready-made brand colours — all pass the contrast check. */
export const BRAND_PRESETS = [
  { name: 'Black', color: '#111111' },
  { name: 'Charcoal', color: '#374151' },
  { name: 'Navy', color: '#1e3a8a' },
  { name: 'Teal', color: '#0f766e' },
  { name: 'Forest', color: '#166534' },
  { name: 'Maroon', color: '#9f1239' },
  { name: 'Plum', color: '#6b21a8' },
  { name: 'Brown', color: '#7c2d12' },
] as const

/** The hover shade: the brand colour mixed 18% towards white. */
export function brandHover(hex: string): string {
  return `#${[1, 3, 5]
    .map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16)
      return Math.round(c + (255 - c) * 0.18)
        .toString(16)
        .padStart(2, '0')
    })
    .join('')}`
}

/** Fonts the shop can use (bundled with the shop at build time — visitors never load from Google). */
export const FONTS = [
  { value: 'system', label: 'System (fastest)' },
  { value: 'inter', label: 'Inter' },
  { value: 'poppins', label: 'Poppins' },
  { value: 'hind_siliguri', label: 'Hind Siliguri (Bangla + English)' },
] as const
export type FontChoice = (typeof FONTS)[number]['value']

export const SHOP_PAGE_SIZES = [12, 24, 36, 48] as const
export const SHOP_SORTS = ['newest', 'price_asc', 'price_desc'] as const

export const SETTINGS_SCHEMA = z.object({
  // Store
  store_name: text(60).min(1, 'Write the store name'),
  store_tagline: text(80),
  // Contact
  store_email: optionalEmail,
  store_phone: optionalPhone,
  store_whatsapp: optionalPhone,
  store_address: text(300),
  store_hours: text(120),
  // Social
  social_facebook: social('social_facebook'),
  social_instagram: social('social_instagram'),
  social_tiktok: social('social_tiktok'),
  social_youtube: social('social_youtube'),
  // Orders and stock
  vat_rate: z
    .number()
    .min(0, 'VAT: 0–100%')
    .max(100, 'VAT: 0–100%')
    .refine((v) => Math.abs(Math.round(v * 100) - v * 100) < 1e-9, 'VAT: at most 2 decimals'),
  return_window_days: z.int('Whole days').min(0).max(90, 'At most 90 days'),
  low_stock_threshold: z.int('A whole number').min(0).max(1000),
  payment_timeout_minutes: z
    .int('Whole minutes')
    .min(5, 'At least 5 minutes')
    .max(1440, 'At most 1,440 minutes (a day)'),
  admin_notification_email: optionalEmail,
  // Shop page
  shop_page_size: z.union([z.literal(12), z.literal(24), z.literal(36), z.literal(48)], {
    error: 'Products per page: 12, 24, 36 or 48',
  }),
  shop_default_sort: z.enum(SHOP_SORTS),
  // After ordering
  thank_you_message: text(300),
  // Google defaults
  seo_title: text(70),
  seo_description: text(160),
  // The look (step 38, part 2)
  logo_url: optionalImage,
  favicon_url: optionalImage,
  share_image_url: optionalImage,
  brand_color: brandColor,
  font: z.enum(['system', 'inter', 'poppins', 'hind_siliguri'], {
    error: 'Choose one of the fonts on the list',
  }),
  // Payments (step 38c). At least one method stays on (checked by the API
  // against the saved values, since a save may change only one of them).
  payment_cod_enabled: z.boolean(),
  payment_online_enabled: z.boolean(),
  payment_cod_description: text(120),
  payment_online_description: text(120),
  /** Biggest order (amount to pay) that may be cash on delivery. 0 = no limit. */
  cod_max_total: z
    .number()
    .refine(
      (v) => v === 0 || (v >= 100 && v <= 1_000_000),
      'Cash-on-delivery limit: ৳100 – ৳10,00,000, or 0 for none',
    )
    .refine(
      (v) => Number.isInteger(v * 100) || Math.abs(Math.round(v * 100) - v * 100) < 1e-9,
      'At most 2 decimals',
    ),
  /** Smallest order (products after any discount, not delivery). 0 = none. */
  min_order_amount: z
    .number()
    .refine(
      (v) => v === 0 || (v >= 1 && v <= 100_000),
      'Minimum order: ৳1 – ৳1,00,000, or 0 for none',
    )
    .refine(
      (v) => Number.isInteger(v * 100) || Math.abs(Math.round(v * 100) - v * 100) < 1e-9,
      'At most 2 decimals',
    ),
})

export type StoreSettings = z.output<typeof SETTINGS_SCHEMA>
export type SettingKey = keyof StoreSettings
export const SETTING_KEYS = Object.keys(SETTINGS_SCHEMA.shape) as SettingKey[]

/** What the shop uses when a setting is missing or broken (today's values). */
export const SETTING_DEFAULTS: StoreSettings = {
  store_name: 'Nowoll',
  store_tagline: 'always new',
  store_email: '',
  store_phone: '',
  store_whatsapp: '',
  store_address: '',
  store_hours: '',
  social_facebook: '',
  social_instagram: '',
  social_tiktok: '',
  social_youtube: '',
  vat_rate: 0,
  return_window_days: 7,
  low_stock_threshold: 5,
  payment_timeout_minutes: 30,
  admin_notification_email: '',
  shop_page_size: 24,
  shop_default_sort: 'newest',
  thank_you_message: '',
  seo_title: '',
  seo_description: '',
  logo_url: '',
  favicon_url: '',
  share_image_url: '',
  brand_color: '#111111',
  font: 'system',
  payment_cod_enabled: true,
  payment_online_enabled: true,
  payment_cod_description: '',
  payment_online_description: '',
  cod_max_total: 0,
  min_order_amount: 0,
}

/** Shown to everyone by GET /settings/public. Never the admin email or internal limits. */
export const PUBLIC_SETTING_KEYS = [
  'store_name',
  'store_tagline',
  'store_email',
  'store_phone',
  'store_whatsapp',
  'store_address',
  'store_hours',
  'social_facebook',
  'social_instagram',
  'social_tiktok',
  'social_youtube',
  'return_window_days',
  'shop_page_size',
  'shop_default_sort',
  'thank_you_message',
  'seo_title',
  'seo_description',
  'logo_url',
  'favicon_url',
  'share_image_url',
  'brand_color',
  'font',
] as const satisfies readonly SettingKey[]

/** The settings that are pictures (uploaded through Admin → Settings → Look). */
export const IMAGE_SETTING_KEYS = ['logo_url', 'favicon_url', 'share_image_url'] as const
export type PublicSettings = Pick<StoreSettings, (typeof PUBLIC_SETTING_KEYS)[number]>

/** Every setting from the stored rows — each missing or broken one falls back to its default. */
export function readSettings(rows: { key: string; value: unknown }[]): StoreSettings {
  const out = { ...SETTING_DEFAULTS } as Record<SettingKey, unknown>
  for (const key of SETTING_KEYS) {
    const row = rows.find((r) => r.key === key)
    if (!row) continue
    const parsed = SETTINGS_SCHEMA.shape[key].safeParse(row.value)
    if (parsed.success) out[key] = parsed.data
  }
  return out as StoreSettings
}

/** The public subset. */
export function publicSettings(s: StoreSettings): PublicSettings {
  return Object.fromEntries(PUBLIC_SETTING_KEYS.map((k) => [k, s[k]])) as PublicSettings
}

/** +8801712345678 → 01712345678 (how people write it here). */
export const localPhone = (e164: string) => e164.replace(/^\+88/, '')

/** A WhatsApp chat link for a stored +880… number. */
export const whatsappLink = (e164: string) => `https://wa.me/${e164.replace(/^\+/, '')}`
