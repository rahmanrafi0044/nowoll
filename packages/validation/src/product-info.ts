import './jitless.js' // first: Zod's no-eval switch (see jitless.ts)
import * as z from 'zod'
import type { PublicSettings } from './settings.js'

// ============================================================================
// The product page's "Delivery and returns" box (step 38d). The admin writes
// only the title, their own lines and a link; delivery, returns and cash on
// delivery are AUTOMATIC lines built from the live settings — change a fee or
// the return window and every product page follows, so the box can't go out
// of date. productInfoLines() is used by BOTH the shop and the admin preview.
// ============================================================================

/** Internal path ("/return-policy") or full https URL. Never javascript: links. */
const linkSchema = z
  .string()
  .trim()
  .max(300)
  .refine((v) => (v.startsWith('/') ? !v.startsWith('//') : /^https:\/\//.test(v)), {
    message: 'Use a path like /return-policy or a full https:// link',
  })

export const productInfoSchema = z.object({
  title: z.string().trim().min(1, 'Write a title').max(40).default('Delivery and returns'),
  showDelivery: z.boolean().default(true),
  showReturns: z.boolean().default(true),
  showCod: z.boolean().default(true),
  /** Plain text, e.g. "100% cotton, made in Bangladesh". */
  lines: z
    .array(
      z.string().trim().min(1, 'Write the line (or remove it)').max(120, 'At most 120 letters'),
    )
    .max(4, 'At most 4 lines of your own')
    .default([]),
  link: z
    .object({ label: z.string().trim().min(1, 'Write the link text').max(40), href: linkSchema })
    .nullable()
    .default(null),
})
export type ProductInfo = z.output<typeof productInfoSchema>

/** The shape of a delivery zone the box needs (GET /shipping/rates). */
export interface InfoZone {
  name: string
  fee: string
  freeShippingThreshold: string | null
  estimatedDaysMin: number | null
  estimatedDaysMax: number | null
  isDefault: boolean
}

export interface InfoLine {
  kind: 'delivery' | 'returns' | 'cod' | 'custom'
  text: string
}

/** ৳60 / ৳3,000 / ৳1,00,000 — how amounts are written in Bangladesh. */
const taka = (amount: string | number) =>
  `৳${Number(amount).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`

const days = (z: InfoZone) =>
  z.estimatedDaysMin !== null && z.estimatedDaysMax !== null
    ? z.estimatedDaysMin === z.estimatedDaysMax
      ? ` · ${z.estimatedDaysMin} day${z.estimatedDaysMin === 1 ? '' : 's'}`
      : ` · ${z.estimatedDaysMin}–${z.estimatedDaysMax} days`
    : ''

/** The box's lines, in order: delivery (one per zone), returns, cash on delivery, the admin's own. */
export function productInfoLines(
  info: ProductInfo,
  zones: InfoZone[],
  settings: Pick<PublicSettings, 'return_window_days' | 'payment_cod_enabled' | 'cod_max_total'>,
): InfoLine[] {
  const lines: InfoLine[] = []
  if (info.showDelivery)
    // Listed zones first, the default ("all other districts") last — like checkout.
    for (const z of [...zones].sort((a, b) => Number(a.isDefault) - Number(b.isDefault))) {
      const fee = Number(z.fee) === 0 ? 'free delivery' : taka(z.fee)
      const free = z.freeShippingThreshold ? ` (free over ${taka(z.freeShippingThreshold)})` : ''
      lines.push({ kind: 'delivery', text: `${z.name}: ${fee}${free}${days(z)}` })
    }
  if (info.showReturns)
    lines.push({
      kind: 'returns',
      text:
        settings.return_window_days > 0
          ? `Easy returns within ${settings.return_window_days} day${settings.return_window_days === 1 ? '' : 's'} of delivery`
          : 'Returns aren’t accepted on this shop',
    })
  if (info.showCod && settings.payment_cod_enabled)
    lines.push({
      kind: 'cod',
      text:
        settings.cod_max_total > 0
          ? `Cash on delivery available (orders up to ${taka(settings.cod_max_total)})`
          : 'Cash on delivery available',
    })
  for (const text of info.lines) lines.push({ kind: 'custom', text })
  return lines
}
