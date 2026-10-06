import { addDays, startOfStoreDay, storeDate, storeDays } from './store-time.js'

describe('store time (Asia/Dhaka)', () => {
  it('a Dhaka day starts at 18:00 UTC the evening before', () => {
    expect(startOfStoreDay('2026-10-06').toISOString()).toBe('2026-10-05T18:00:00.000Z')
  })

  it('storeDate: just after Dhaka midnight is already the NEXT day (though UTC says otherwise)', () => {
    expect(storeDate(new Date('2026-10-05T18:30:00Z'))).toBe('2026-10-06') // 00:30 in Dhaka
    expect(storeDate(new Date('2026-10-05T17:30:00Z'))).toBe('2026-10-05') // 23:30 in Dhaka
  })

  it('addDays crosses months and years', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('storeDays: 7 whole days ending today, end exclusive', () => {
    const r = storeDays('2026-10-06', 7)
    expect(r.dates).toEqual([
      '2026-09-30',
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
      '2026-10-04',
      '2026-10-05',
      '2026-10-06',
    ])
    expect(r.from.toISOString()).toBe('2026-09-29T18:00:00.000Z')
    expect(r.to.toISOString()).toBe('2026-10-06T18:00:00.000Z')
  })
})
