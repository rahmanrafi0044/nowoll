import { formatBdt, formatDayMonth, formatLongDay, formatShortDay, percentChange } from './format'

describe('format', () => {
  it('money in taka, lakh grouping, poisha only when present', () => {
    expect(formatBdt('1490')).toBe('৳1,490')
    expect(formatBdt('100000')).toBe('৳1,00,000')
    expect(formatBdt('100.5')).toBe('৳100.50')
  })

  it('shop days are shown as given — never shifted by the browser time zone', () => {
    expect(formatShortDay('2026-10-06')).toBe('Tue 6')
    expect(formatLongDay('2026-10-06')).toBe('Tuesday 6 October')
    expect(formatDayMonth('2026-10-06')).toBe('6 Oct')
  })

  it('percent change, or null when the earlier period had nothing', () => {
    expect(percentChange(1200, 1000)).toBe(20)
    expect(percentChange(500, 1000)).toBe(-50)
    expect(percentChange(5, 0)).toBeNull()
  })
})
