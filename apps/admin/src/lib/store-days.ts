// ============================================================================
// Whole shop days in BANGLADESH time, whatever computer the admin uses.
// (Same rules as apps/api/src/analytics/store-time.ts.) Discount codes work
// from 00:00 on their first day to the end of their last day, Dhaka time.
// ============================================================================
const TIME_ZONE = 'Asia/Dhaka'

const dayFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})
const partsFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  second: 'numeric',
})

/** The shop's calendar date at this instant: YYYY-MM-DD. */
export const storeDate = (at: Date) => dayFormat.format(at)

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** The instant this shop day starts (00:00 in Dhaka). */
export function startOfStoreDay(date: string): Date {
  const utcMidnight = new Date(`${date}T00:00:00Z`)
  const p = Object.fromEntries(partsFormat.formatToParts(utcMidnight).map((x) => [x.type, x.value]))
  const asIfUtc = Date.UTC(+p.year!, +p.month! - 1, +p.day!, +p.hour!, +p.minute!, +p.second!)
  return new Date(utcMidnight.getTime() - (asIfUtc - utcMidnight.getTime()))
}

/** A code's first day → the instant it starts. */
export const startsAtFor = (day: string) => startOfStoreDay(day).toISOString()
/** A code's last day → the instant it stops (the start of the NEXT day: "expired" from then on). */
export const expiresAtFor = (day: string) => startOfStoreDay(addDays(day, 1)).toISOString()
/** The stored instants → the days shown in the form. */
export const firstDayOf = (startsAt: string) => storeDate(new Date(startsAt))
export const lastDayOf = (expiresAt: string) =>
  storeDate(new Date(new Date(expiresAt).getTime() - 1))
