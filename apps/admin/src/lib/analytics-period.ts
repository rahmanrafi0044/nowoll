// ============================================================================
// The Analytics page's period (step 41): a preset ("Last 30 days", "This
// month"…) or custom dates, kept in the page address (?range=last30 or
// ?from=2026-09-01&to=2026-09-30) so a view can be bookmarked or sent.
// Days are Bangladesh calendar days, like the API (docs/analytics.md).
// ============================================================================

export const PRESETS = [
  { id: 'last7', label: 'Last 7 days' },
  { id: 'last30', label: 'Last 30 days' },
  { id: 'last90', label: 'Last 90 days' },
  { id: 'thisMonth', label: 'This month' },
  { id: 'lastMonth', label: 'Last month' },
  { id: 'thisYear', label: 'This year' },
] as const
export type PresetId = (typeof PRESETS)[number]['id']

export const DEFAULT_PRESET: PresetId = 'last30'
/** The API's limit (366 days). */
export const MAX_DAYS = 366

export interface AnalyticsPeriod {
  /** Which preset, or 'custom'. */
  preset: PresetId | 'custom'
  from: string // YYYY-MM-DD
  to: string
  /** "Last 30 days" or "1 Sep – 30 Sep 2026". */
  label: string
}

const DATE = /^\d{4}-\d{2}-\d{2}$/
const dhakaDay = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Dhaka',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** Today in Bangladesh, YYYY-MM-DD. */
export const dhakaToday = (now: Date) => dhakaDay.format(now)

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

const isRealDate = (s: string) =>
  DATE.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s

export const daysIn = (from: string, to: string) =>
  (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 + 1

/** A preset's dates, counted from today (Dhaka). */
export function presetDates(id: PresetId, today: string): { from: string; to: string } {
  const [y, m] = today.split('-') as [string, string]
  switch (id) {
    case 'last7':
      return { from: addDays(today, -6), to: today }
    case 'last30':
      return { from: addDays(today, -29), to: today }
    case 'last90':
      return { from: addDays(today, -89), to: today }
    case 'thisMonth':
      return { from: `${y}-${m}-01`, to: today }
    case 'lastMonth': {
      const firstOfThis = `${y}-${m}-01`
      const lastOfPrev = addDays(firstOfThis, -1)
      return { from: `${lastOfPrev.slice(0, 7)}-01`, to: lastOfPrev }
    }
    case 'thisYear':
      return { from: `${y}-01-01`, to: today }
  }
}

const range = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})
/** "1 Sep 2026 – 30 Sep 2026" (Intl shortens shared parts: "1–30 Sep 2026"). */
export const formatRange = (from: string, to: string) =>
  range.formatRange(new Date(`${from}T00:00:00Z`), new Date(`${to}T00:00:00Z`))

/** Why custom dates can't be used, or null if they're fine. */
export function customProblem(from: string, to: string): string | null {
  if (!isRealDate(from) || !isRealDate(to)) return 'Choose both dates.'
  if (from > to) return 'The start date must be on or before the end date.'
  if (daysIn(from, to) > MAX_DAYS) return `Choose at most ${MAX_DAYS} days.`
  return null
}

/**
 * The period from the page address. Anything unknown or invalid falls back
 * to the default ("Last 30 days") — a broken link never breaks the page.
 */
export function parsePeriod(
  params: Record<string, string | string[] | undefined>,
  now: Date,
): AnalyticsPeriod {
  const one = (k: string) => (typeof params[k] === 'string' ? params[k] : undefined)
  const today = dhakaToday(now)
  const from = one('from')
  const to = one('to')
  if (from !== undefined && to !== undefined && customProblem(from, to) === null)
    return { preset: 'custom', from, to, label: formatRange(from, to) }
  const preset =
    PRESETS.find((p) => p.id === one('range')) ?? PRESETS.find((p) => p.id === DEFAULT_PRESET)!
  return { preset: preset.id, ...presetDates(preset.id, today), label: preset.label }
}

/** The page address for a period (the default needs no query at all). */
export function periodHref(p: { preset: PresetId } | { from: string; to: string }): string {
  const base = '/admin/analytics'
  if ('preset' in p) return p.preset === DEFAULT_PRESET ? base : `${base}?range=${p.preset}`
  return `${base}?from=${p.from}&to=${p.to}`
}

/** The query string the API takes. */
export const periodQuery = (p: { from: string; to: string }) => `from=${p.from}&to=${p.to}`
