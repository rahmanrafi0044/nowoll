import { DATE_TIME_OPTIONS, formatInstantDate, formatInstantDateTime } from './date'

// Times are shown in Dhaka time (UTC+6), 12-hour clock.
describe('admin dates', () => {
  it('12-hour clock counted 1–12 in every browser (Chrome\'s en-GB default is 0–11: "0:47 am")', () => {
    expect(DATE_TIME_OPTIONS.hourCycle).toBe('h12')
    expect(new Intl.DateTimeFormat('en-GB', DATE_TIME_OPTIONS).resolvedOptions().hourCycle).toBe(
      'h12',
    )
  })

  it('just after midnight reads 12:… am, not 0:… am', () => {
    // 18:47 UTC = 00:47 in Dhaka the next day
    expect(formatInstantDateTime('2026-10-24T18:47:00Z')).toBe('25 Oct, 12:47 am')
  })

  it('noon and afternoon', () => {
    expect(formatInstantDateTime('2026-10-25T06:05:00Z')).toBe('25 Oct, 12:05 pm')
    expect(formatInstantDateTime('2026-10-25T09:30:00Z')).toBe('25 Oct, 3:30 pm')
  })

  it('the date alone, in Dhaka', () => {
    expect(formatInstantDate('2026-10-05T18:30:00Z')).toBe('6 Oct 2026')
  })
})
