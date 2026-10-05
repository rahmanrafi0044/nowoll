// Default rows inserted by `pnpm db:seed`.
//
// These are STARTING VALUES ONLY. After the first seed, Rafi edits all of them
// from the admin panel (Settings / Shipping / Content). The seed never
// overwrites a row that already exists, so re-running it is always safe.

export interface SettingSeed {
  key: string
  value: string | number | boolean
  description: string
}

export const defaultSettings: SettingSeed[] = [
  { key: 'store_name', value: 'Nowoll', description: 'Store name shown in emails and page titles' },
  { key: 'store_tagline', value: 'always new', description: 'Tagline shown under the logo' },
  { key: 'store_email', value: '', description: 'Public contact email shown on the site' },
  { key: 'store_phone', value: '', description: 'Public contact phone, e.g. +8801XXXXXXXXX' },
  {
    key: 'store_address',
    value: '',
    description: 'Business address shown in the footer and invoices',
  },
  {
    key: 'admin_notification_email',
    value: '',
    description: 'Where low-stock and new-order alerts are sent',
  },
  {
    key: 'currency',
    value: 'BDT',
    description: 'Store currency (display only — all amounts are BDT)',
  },
  {
    key: 'vat_rate',
    value: 0,
    description: 'VAT percentage added at checkout, e.g. 7.5. Set 0 to disable',
  },
  {
    key: 'low_stock_threshold',
    value: 5,
    description: 'Alert when a variant’s stock drops to this number or below',
  },
  {
    key: 'return_window_days',
    value: 7,
    description: 'Days after delivery a customer may request a return',
  },
  {
    key: 'payment_timeout_minutes',
    value: 30,
    description:
      'Unpaid online orders are cancelled (and their stock released) after this many minutes',
  },
]

export interface ShippingZoneSeed {
  code: string
  name: string
  districts: string[]
  isDefault: boolean
  fee: number
  freeShippingThreshold: number | null
  estimatedDaysMin: number
  estimatedDaysMax: number
}

// PLACEHOLDER FEES — confirm real rates with your courier and edit them in
// Admin → Shipping before launch.
export const defaultShippingZones: ShippingZoneSeed[] = [
  {
    code: 'DHAKA',
    name: 'Inside Dhaka',
    districts: ['Dhaka'],
    isDefault: false,
    fee: 60,
    freeShippingThreshold: null,
    estimatedDaysMin: 1,
    estimatedDaysMax: 3,
  },
  {
    code: 'OUTSIDE_DHAKA',
    name: 'Outside Dhaka',
    districts: [], // empty + isDefault = every district not listed in another zone
    isDefault: true,
    fee: 120,
    freeShippingThreshold: null,
    estimatedDaysMin: 3,
    estimatedDaysMax: 5,
  },
]

export interface PageSeed {
  slug: string
  title: string
}

// Created as DRAFT with placeholder text — the launch checklist requires the
// real policy text to be written and published from Admin → Content.
export const defaultPages: PageSeed[] = [
  { slug: 'privacy', title: 'Privacy Policy' },
  { slug: 'terms', title: 'Terms of Service' },
  { slug: 'returns', title: 'Return Policy' },
]

export interface ContentBlockSeed {
  key: string
  data: Record<string, string | null>
  isActive: boolean
}

// Starting homepage content — edited later in Admin → Content (Phase 5).
// Shapes must match packages/validation/src/content.ts, or the API hides them.
export const defaultContentBlocks: ContentBlockSeed[] = [
  {
    key: 'announcement_bar',
    data: { text: 'Welcome to Nowoll — always new', href: null },
    isActive: false,
  },
  {
    key: 'homepage_hero',
    data: {
      heading: 'always new',
      subheading: 'Everyday clothing for Bangladesh — delivered nationwide.',
      ctaLabel: 'Shop now',
      ctaHref: '/shop',
      imageUrl: null,
      imageAlt: null,
    },
    isActive: true,
  },
]
