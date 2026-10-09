import type { DiscountStatus } from '@nowoll/types'
import type { BadgeVariant } from '@nowoll/ui'
import { formatBdt, formatDayMonth } from '@/lib/format'

export const DISCOUNT_STATUS: Record<DiscountStatus, { label: string; variant: BadgeVariant }> = {
  ACTIVE: { label: 'Active', variant: 'success' },
  SCHEDULED: { label: 'Scheduled', variant: 'info' },
  EXPIRED: { label: 'Expired', variant: 'neutral' },
  USED_UP: { label: 'Used up', variant: 'warning' },
  OFF: { label: 'Off', variant: 'neutral' },
}

/** What a code does, in one sentence — shown live while editing, and in the list. */
export function describeDiscount(d: {
  type: 'PERCENTAGE' | 'FIXED_AMOUNT'
  value: number | null
  minOrderAmount: number | null
  maxDiscountAmount: number | null
  usageLimit: number | null
  usageLimitPerCustomer: number | null
  firstDay: string | null
  lastDay: string | null
}): string {
  if (d.value === null || !(d.value > 0)) return ''
  const parts = [
    d.type === 'PERCENTAGE' ? `${d.value}% off` : `${formatBdt(d.value)} off`,
    d.minOrderAmount ? `orders of ${formatBdt(d.minOrderAmount)} or more` : 'any order',
  ]
  let sentence = parts.join(' ')
  if (d.type === 'PERCENTAGE' && d.maxDiscountAmount)
    sentence += `, at most ${formatBdt(d.maxDiscountAmount)}`
  if (d.usageLimitPerCustomer === 1) sentence += ', once per customer'
  else if (d.usageLimitPerCustomer) sentence += `, ${d.usageLimitPerCustomer} times per customer`
  if (d.usageLimit) sentence += `, first ${d.usageLimit} uses`
  if (d.firstDay && d.lastDay)
    sentence += `, ${formatDayMonth(d.firstDay)} – ${formatDayMonth(d.lastDay)}`
  else if (d.firstDay) sentence += `, from ${formatDayMonth(d.firstDay)}`
  else if (d.lastDay) sentence += `, until ${formatDayMonth(d.lastDay)}`
  return `${sentence}.`
}

/** A readable random code, e.g. "SAVE-7K2Q" (no 0/O/1/I to misread). */
export function generateCode(prefix = 'SAVE'): string {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(4))
  return `${prefix}-${Array.from(bytes, (b) => letters[b % letters.length]).join('')}`
}
