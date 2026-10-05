import type { Money } from '@nowoll/types'

// en-IN grouping matches how Bangladesh writes large numbers (lakh system):
// 1,490 · 12,500 · 1,00,000. Decimals only when there are poisha (decision #4).
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

/** Whole-number discount for a "-17%" badge, or null if there's no real discount. */
export function discountPercent(price: Money, compareAt: Money | null): number | null {
  if (compareAt === null) return null
  const p = Number(price)
  const was = Number(compareAt)
  if (!(was > p) || p <= 0) return null
  return Math.round(((was - p) / was) * 100)
}
