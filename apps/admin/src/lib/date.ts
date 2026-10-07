// Instants (e.g. "updated at") shown as the shop's calendar date — Bangladesh time.
const dateFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'Asia/Dhaka',
})

/** "2026-10-05T18:30:00Z" → "6 Oct 2026" (00:30 in Dhaka) */
export const formatInstantDate = (iso: string) => dateFormat.format(new Date(iso))

const dateTimeFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
  timeZone: 'Asia/Dhaka',
})

/** "2026-10-05T18:30:00Z" → "6 Oct, 12:30 am" (Dhaka time) */
export const formatInstantDateTime = (iso: string) => dateTimeFormat.format(new Date(iso))
