// The same money/date formats as the shop (apps/storefront/src/lib/format.ts),
// so an email never shows a total differently from the website.

/** Amounts arrive as decimal strings ("1490", "1499.5") — never floats from the database. */
export type Money = string

const whole = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 })
const withPoisha = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/** "1490" → "৳1,490" · "1499.5" → "৳1,499.50" · 100000 → "৳1,00,000" (lakh grouping) */
export function formatBdt(amount: Money | number): string {
  const n = typeof amount === 'number' ? amount : Number(amount)
  return `৳${Number.isInteger(n) ? whole.format(n) : withPoisha.format(n)}`
}

/** "6 October 2026" in Bangladesh time. */
export const formatDate = (iso: string | Date) =>
  new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Dhaka',
  })
