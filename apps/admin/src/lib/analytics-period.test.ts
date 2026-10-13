import { customProblem, dhakaToday, parsePeriod, periodHref, presetDates } from './analytics-period'

describe('Analytics period (step 41)', () => {
  it('today is the Bangladesh date (00:30 in Dhaka is still the previous day in UTC)', () => {
    expect(dhakaToday(new Date('2026-10-12T18:30:00Z'))).toBe('2026-10-13')
    expect(dhakaToday(new Date('2026-10-12T17:59:00Z'))).toBe('2026-10-12')
  })

  it('presets, counted from today (both ends included)', () => {
    const today = '2026-10-13'
    expect(presetDates('last7', today)).toEqual({ from: '2026-10-07', to: today })
    expect(presetDates('last30', today)).toEqual({ from: '2026-09-14', to: today })
    expect(presetDates('last90', today)).toEqual({ from: '2026-07-16', to: today })
    expect(presetDates('thisMonth', today)).toEqual({ from: '2026-10-01', to: today })
    expect(presetDates('lastMonth', today)).toEqual({ from: '2026-09-01', to: '2026-09-30' })
    expect(presetDates('thisYear', today)).toEqual({ from: '2026-01-01', to: today })
  })

  it('month and year edges: last month in January is December; February has 28 days', () => {
    expect(presetDates('lastMonth', '2027-01-05')).toEqual({ from: '2026-12-01', to: '2026-12-31' })
    expect(presetDates('lastMonth', '2027-03-01')).toEqual({ from: '2027-02-01', to: '2027-02-28' })
    expect(presetDates('thisMonth', '2026-10-01')).toEqual({ from: '2026-10-01', to: '2026-10-01' })
  })

  it('from the address: a preset, custom dates, or the default for anything broken', () => {
    const now = new Date('2026-10-13T06:00:00Z')
    expect(parsePeriod({}, now)).toEqual({
      preset: 'last30',
      from: '2026-09-14',
      to: '2026-10-13',
      label: 'Last 30 days',
    })
    expect(parsePeriod({ range: 'lastMonth' }, now)).toMatchObject({
      preset: 'lastMonth',
      from: '2026-09-01',
      to: '2026-09-30',
    })
    expect(parsePeriod({ from: '2026-09-01', to: '2026-09-15' }, now)).toMatchObject({
      preset: 'custom',
      from: '2026-09-01',
      to: '2026-09-15',
      label: expect.stringMatching(/1.+15 Sept? 2026/),
    })
    for (const bad of [
      { range: 'forever' },
      { from: '2026-09-31', to: '2026-10-01' },
      { from: '2026-10-05', to: '2026-10-01' },
      { from: '2025-01-01', to: '2026-01-05' }, // over a year
      { from: '2026-09-01' },
      { from: ['2026-09-01', 'x'], to: '2026-09-02' },
    ])
      expect(parsePeriod(bad, now).preset).toBe('last30')
  })

  it('custom dates: explained, not silently changed', () => {
    expect(customProblem('', '2026-10-01')).toBe('Choose both dates.')
    expect(customProblem('2026-10-05', '2026-10-01')).toMatch(/on or before/)
    expect(customProblem('2025-01-01', '2026-01-05')).toMatch(/at most 366 days/)
    expect(customProblem('2025-10-13', '2026-10-13')).toBeNull() // 366 days is fine
  })

  it('addresses: the default needs no query; presets and dates otherwise', () => {
    expect(periodHref({ preset: 'last30' })).toBe('/admin/analytics')
    expect(periodHref({ preset: 'thisYear' })).toBe('/admin/analytics?range=thisYear')
    expect(periodHref({ from: '2026-09-01', to: '2026-09-30' })).toBe(
      '/admin/analytics?from=2026-09-01&to=2026-09-30',
    )
  })
})
