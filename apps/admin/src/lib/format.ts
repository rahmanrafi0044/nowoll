import type { Money } from '@nowoll/types'

// Same money format as the shop (apps/storefront/src/lib/format.ts):
// en-IN grouping matches how Bangladesh writes large numbers (lakh system):
// 1,490 · 12,500 · 1,00,000. Decimals only when there are poisha.
const whole = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 })
const withPoisha = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/** "1490" → "৳1,490" · "1499.5" → "৳1,499.50" · 100000 → "৳1,00,000" */
export function formatBdt(amount: Money | number): string {
  const n = typeof amount === 'number' ? amount : Number(amount)
  const text = Number.isInteger(n) ? whole.format(n) : withPoisha.format(n)
  return `৳${text}`
}

// Shop calendar days arrive as "YYYY-MM-DD" (already Bangladesh dates), so
// they're formatted AS UTC — otherwise a browser in another time zone could
// shift them a day.
const shortDay = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  timeZone: 'UTC',
})
const longDay = new Intl.DateTimeFormat('en-GB', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
})
const dayMonth = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
})
const asDate = (d: string) => new Date(`${d}T00:00:00Z`)

/** "2026-10-06" → "Tue 6" */
export const formatShortDay = (d: string) => shortDay.format(asDate(d))
/** "2026-10-06" → "Tuesday 6 October" */
export const formatLongDay = (d: string) => longDay.format(asDate(d))
/** "2026-10-06" → "6 Oct" */
export const formatDayMonth = (d: string) => dayMonth.format(asDate(d))

/**
 * Change vs an earlier period, as a whole percent: 1200 vs 1000 → 20.
 * null when there's nothing to compare with (the earlier period was 0).
 */
export function percentChange(now: number, before: number): number | null {
  if (before === 0) return null
  return Math.round(((now - before) / before) * 100)
}
