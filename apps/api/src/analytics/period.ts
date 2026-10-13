import { BadRequestException } from '@nestjs/common'
import { addDays, startOfStoreDay, storeDate, storeDays } from './store-time.js'

// ============================================================================
// The period an analytics answer covers (step 40): whole shop days in
// Bangladesh time. Asked either as "the last N days" (the dashboard) or as
// from/to calendar dates (the analytics page). Every answer can also be
// compared with the PREVIOUS period of the same length ("▲ 12%").
// ============================================================================

/** At most a year (plus a leap day): enough for "this year", small enough to stay fast. */
export const MAX_PERIOD_DAYS = 366

export interface Period {
  first: string // YYYY-MM-DD
  last: string
  from: Date // first day's midnight in Dhaka, as UTC
  to: Date // the day after `last`, exclusive
  dates: string[]
}

/** Whole days from `first` to `last`, both included. */
export function daysBetween(first: string, last: string): number {
  return (Date.parse(`${last}T00:00:00Z`) - Date.parse(`${first}T00:00:00Z`)) / 86_400_000 + 1
}

const isCalendarDate = (s: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s

/**
 * The period asked for: from/to (both, or neither) — else the last `days`
 * days up to today. Refuses impossible dates, from after to, and periods
 * longer than MAX_PERIOD_DAYS.
 */
export function periodFor(
  q: { from?: string; to?: string; days: number },
  now: Date,
  maxDays = MAX_PERIOD_DAYS,
): Period {
  if (q.from === undefined && q.to === undefined) return storeDays(storeDate(now), q.days)
  if (q.from === undefined || q.to === undefined)
    throw new BadRequestException('Give both from and to (YYYY-MM-DD), or neither.')
  if (!isCalendarDate(q.from) || !isCalendarDate(q.to))
    throw new BadRequestException('from and to must be real dates like 2026-09-30.')
  const length = daysBetween(q.from, q.to)
  if (length < 1) throw new BadRequestException('from must be on or before to.')
  if (length > maxDays) throw new BadRequestException(`A period can be at most ${maxDays} days.`)
  return storeDays(q.to, length)
}

/** The same number of days, just before. */
export function previousPeriod(p: Period): Period {
  return storeDays(addDays(p.first, -1), p.dates.length)
}

export { startOfStoreDay }
