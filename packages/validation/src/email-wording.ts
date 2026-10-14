import { z } from 'zod'

// ============================================================================
// Email wording (step 43b) — Admin → Content → Emails. For each customer
// email: subject, heading and opening paragraph; plus the footer line and
// whether the logo shows. Plain text only (no HTML, Markdown or links — Rule 9).
// Empty = today's wording. The FACTS (amounts, receipt, tracking, buttons…)
// and the layout are not editable — see packages/email/src/templates.
// ============================================================================

/** Each customer email, with the placeholders it can fill in. */
export const EMAIL_KINDS = {
  welcome: { label: 'Welcome (new account)', placeholders: ['name', 'store'] },
  'order-confirmation': {
    label: 'Order placed (cash on delivery)',
    placeholders: ['name', 'order', 'store'],
  },
  'payment-confirmed': {
    label: 'Payment received (online)',
    placeholders: ['name', 'order', 'amount', 'store'],
  },
  'order-shipped': { label: 'Order shipped', placeholders: ['name', 'order', 'store'] },
  'order-delivered': { label: 'Order delivered', placeholders: ['name', 'order', 'store'] },
  'return-approved': { label: 'Return approved', placeholders: ['name', 'order', 'store'] },
  'return-rejected': { label: 'Return not accepted', placeholders: ['name', 'order', 'store'] },
  'refund-processed': {
    label: 'Refund sent',
    placeholders: ['name', 'order', 'amount', 'store'],
  },
  'newsletter-confirm': { label: 'Newsletter: please confirm', placeholders: ['store'] },
} as const satisfies Record<string, { label: string; placeholders: readonly string[] }>

export type EmailKind = keyof typeof EMAIL_KINDS
export const EMAIL_KIND_KEYS = Object.keys(EMAIL_KINDS) as EmailKind[]

/** What each placeholder becomes — shown next to the fields. */
export const PLACEHOLDER_HELP: Record<string, string> = {
  name: 'the customer’s first name',
  order: 'the order number, e.g. NW-10001',
  amount: 'the amount, e.g. ৳1,550',
  store: 'your store name',
}

/** {name}-style placeholders used in a text. */
export const placeholdersIn = (text: string) =>
  [...text.matchAll(/\{([^{}\s]*)\}/g)].map((m) => m[1]!)

const line = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `At most ${max} letters`)
    .refine((v) => !/[\r\n]/.test(v), 'One line only')
    .default('')

const emailText = z.object({
  subject: line(120),
  heading: line(120),
  intro: z.string().trim().max(600, 'At most 600 letters').default(''),
})

/** Every placeholder must be one this email knows (a typo would reach customers). */
function knownPlaceholders(
  emails: Partial<Record<EmailKind, { subject: string; heading: string; intro: string }>>,
  ctx: z.RefinementCtx,
) {
  for (const kind of EMAIL_KIND_KEYS) {
    const e = emails[kind]
    if (!e) continue
    const allowed: readonly string[] = EMAIL_KINDS[kind].placeholders
    for (const field of ['subject', 'heading', 'intro'] as const)
      for (const p of placeholdersIn(e[field]))
        if (!allowed.includes(p))
          ctx.addIssue({
            code: 'custom',
            path: ['emails', kind, field],
            message: `“{${p}}” isn’t known here — use ${allowed.map((a) => `{${a}}`).join(', ')}`,
          })
  }
}

export const emailWordingSchema = z
  .object({
    /** Replaces "You're receiving this because you shopped at …". Empty = that line. */
    footer: z.string().trim().max(300, 'At most 300 letters').default(''),
    /** Show the logo (Settings → Look) at the top instead of the store name. */
    showLogo: z.boolean().default(false),
    emails: z
      .partialRecord(z.enum(EMAIL_KIND_KEYS as [EmailKind, ...EmailKind[]]), emailText)
      .default({}),
  })
  .superRefine((w, ctx) => knownPlaceholders(w.emails, ctx))

export type EmailWording = z.output<typeof emailWordingSchema>
export type EmailText = z.output<typeof emailText>

export const EMPTY_EMAIL_WORDING: EmailWording = { footer: '', showLogo: false, emails: {} }

/** Fill {name}, {order}… — any placeholder without a value is dropped, never shown raw. */
export function fillPlaceholders(text: string, values: Partial<Record<string, string>>): string {
  return text.replace(/\{([^{}\s]*)\}/g, (_, key: string) => values[key] ?? '')
}

/**
 * Everything emails need from Admin (step 43b): name, tagline, colour (Settings),
 * plus the wording, footer and — when switched on — the logo. A missing,
 * cleared or broken wording block means today's wording, never a failed email.
 */
export function emailBrand(
  settings: {
    store_name: string
    store_tagline: string
    brand_color: string
    logo_url: string
  },
  wordingBlock: { data: unknown; isActive: boolean } | null,
) {
  const parsed =
    wordingBlock?.isActive === true ? emailWordingSchema.safeParse(wordingBlock.data) : null
  const wording = parsed?.success ? parsed.data : EMPTY_EMAIL_WORDING
  return {
    name: settings.store_name,
    tagline: settings.store_tagline,
    color: settings.brand_color,
    footer: wording.footer,
    wording: wording.emails,
    ...(wording.showLogo && settings.logo_url && { logoUrl: settings.logo_url }),
  }
}
