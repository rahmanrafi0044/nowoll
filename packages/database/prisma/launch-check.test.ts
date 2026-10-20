import { describe, expect, it } from 'vitest'
import { type DbFacts, judge } from './launch-check'

/** A production database ready for launch. */
const ready = (): DbFacts => ({
  pendingMigrations: [],
  tablesWithoutRls: [],
  tableCount: 30,
  bucket: { exists: true, public: true },
  activeProducts: 100,
  activeWithoutPhoto: 0,
  photosWithoutAlt: 0,
  demoProducts: 0,
  admins: 1,
})

const failing = (f: DbFacts) =>
  judge(f)
    .filter((c) => c.status !== 'pass')
    .map((c) => c.item)

describe('database launch check (step 54)', () => {
  it('a ready database passes everything', () => {
    expect(failing(ready())).toEqual([])
  })

  const cases: [string, Partial<DbFacts>, string][] = [
    [
      'a migration not applied',
      { pendingMigrations: ['20261014051105_redirects'] },
      'all database changes (migrations) applied',
    ],
    ['a table without RLS', { tablesWithoutRls: ['orders'] }, 'row-level security on every table'],
    ['no tables at all', { tableCount: 0 }, 'row-level security on every table'],
    [
      'no photo bucket',
      { bucket: { exists: false, public: false } },
      'photo bucket "product-images" exists and is public',
    ],
    [
      'a private bucket',
      { bucket: { exists: true, public: false } },
      'photo bucket "product-images" exists and is public',
    ],
    ['not Supabase', { bucket: null }, 'photo bucket "product-images" exists and is public'],
    ['nothing for sale', { activeProducts: 0 }, 'products for sale'],
    ['a product without photo', { activeWithoutPhoto: 2 }, 'every product for sale has a photo'],
    ['empty alt text', { photosWithoutAlt: 3 }, 'every photo has alt text'],
    ['demo products left', { demoProducts: 7 }, 'no demo / test products'],
    ['no Admin', { admins: 0 }, 'an Admin account exists'],
  ]
  it.each(cases)('catches %s', (_name, change, item) => {
    expect(failing({ ...ready(), ...change })).toEqual([item])
  })

  it('reports counts and names — never customer data', () => {
    const text = JSON.stringify(judge({ ...ready(), demoProducts: 2, photosWithoutAlt: 1 }))
    expect(text).not.toMatch(/@|\+880/)
  })
})
