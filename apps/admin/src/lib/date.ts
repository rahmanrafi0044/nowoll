// Instants (e.g. "updated at") shown as the shop's calendar date — Bangladesh time.
const dateFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'Asia/Dhaka',
})

/** "2026-10-05T18:30:00Z" → "6 Oct 2026" (00:30 in Dhaka) */
export const formatInstantDate = (iso: string) => dateFormat.format(new Date(iso))

/** Exported for the test: browsers differ (Chrome's en-GB counts 0–11), so the cycle is set explicitly. */
export const DATE_TIME_OPTIONS: Intl.DateTimeFormatOptions = {
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
  // h12 = 12:30 am / 12:30 pm. (British English with `hour12: true` alone counts
  // hours 0–11 and showed "0:47 am" for 12:47 am.)
  hourCycle: 'h12',
  timeZone: 'Asia/Dhaka',
}
const dateTimeFormat = new Intl.DateTimeFormat('en-GB', DATE_TIME_OPTIONS)

/** "2026-10-05T18:30:00Z" → "6 Oct, 12:30 am" (Dhaka time) */
export const formatInstantDateTime = (iso: string) => dateTimeFormat.format(new Date(iso))
