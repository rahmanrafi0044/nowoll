// ============================================================================
// "Today" for the shop = a day in BANGLADESH time, not the server's (UTC).
// An order placed at 1am in Dhaka is 7pm the previous day in UTC — counting
// it by UTC would put it on the wrong day in every chart.
//
// The database stores plain UTC timestamps, so we turn each Dhaka calendar
// day into its exact UTC start instant and query with those. The offset is
// asked of the time-zone database (Intl), never written in as "+6".
// ============================================================================

export const STORE_TIME_ZONE = 'Asia/Dhaka'

const dayFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: STORE_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** The shop's calendar date at this instant, as YYYY-MM-DD. */
export function storeDate(at: Date): string {
  return dayFormat.format(at) // en-CA formats as YYYY-MM-DD
}

/** YYYY-MM-DD plus n days (n may be negative). Pure calendar arithmetic. */
export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** The UTC instant when this shop calendar day begins (midnight in Dhaka). */
export function startOfStoreDay(date: string): Date {
  const utcMidnight = new Date(`${date}T00:00:00Z`)
  // Dhaka's offset from UTC at that moment, in minutes.
  return new Date(utcMidnight.getTime() - offsetMinutes(utcMidnight) * 60_000)
}

/** A range of whole shop days: [first day's midnight, the day after the last's midnight). */
export function storeDays(lastDay: string, count: number) {
  const first = addDays(lastDay, -(count - 1))
  return {
    first,
    last: lastDay,
    from: startOfStoreDay(first),
    to: startOfStoreDay(addDays(lastDay, 1)), // exclusive
    dates: Array.from({ length: count }, (_, i) => addDays(first, i)),
  }
}

const partsFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: STORE_TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  second: 'numeric',
})

function offsetMinutes(at: Date): number {
  const p = Object.fromEntries(partsFormat.formatToParts(at).map((x) => [x.type, x.value]))
  const asIfUtc = Date.UTC(+p.year!, +p.month! - 1, +p.day!, +p.hour!, +p.minute!, +p.second!)
  return Math.round((asIfUtc - Math.floor(at.getTime() / 1000) * 1000) / 60_000)
}
