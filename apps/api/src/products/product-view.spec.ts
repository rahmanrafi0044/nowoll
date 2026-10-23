import { Prisma } from '@nowoll/database'
import { fromPrice, productBadges } from './product-view.js'

const DAY = 24 * 60 * 60 * 1000
const NOW = new Date('2026-10-20T12:00:00Z').getTime()
const daysAgo = (n: number) => new Date(NOW - n * DAY)
const d = (n: number) => new Prisma.Decimal(n)

describe('productBadges (38f)', () => {
  const product = (over: Partial<Parameters<typeof productBadges>[0]> = {}) => ({
    createdAt: daysAgo(60),
    restockedAt: null,
    readyToShip: false,
    ...over,
  })

  it('"New" while younger than the badge days, then not', () => {
    expect(productBadges(product({ createdAt: daysAgo(3) }), true, 14, NOW).isNew).toBe(true)
    expect(productBadges(product({ createdAt: daysAgo(15) }), true, 14, NOW).isNew).toBe(false)
  })

  it('"Restocked" for a while after a restock — only when it can be bought', () => {
    const p = product({ restockedAt: daysAgo(2) })
    expect(productBadges(p, true, 14, NOW).restocked).toBe(true)
    expect(productBadges(p, false, 14, NOW).restocked).toBe(false) // sold out again
    expect(productBadges(product({ restockedAt: daysAgo(20) }), true, 14, NOW).restocked).toBe(
      false,
    )
  })

  it('a new product is "New", not also "Restocked"', () => {
    const b = productBadges(
      product({ createdAt: daysAgo(1), restockedAt: daysAgo(1) }),
      true,
      14,
      NOW,
    )
    expect(b).toMatchObject({ isNew: true, restocked: false })
  })

  it('badge days 0 → no New / Restocked badges at all', () => {
    const b = productBadges(
      product({ createdAt: daysAgo(0), restockedAt: daysAgo(0) }),
      true,
      0,
      NOW,
    )
    expect(b).toMatchObject({ isNew: false, restocked: false })
  })

  it('"Ready to ship" is exactly what the admin ticked', () => {
    expect(productBadges(product({ readyToShip: true }), true, 14, NOW).readyToShip).toBe(true)
    expect(productBadges(product(), true, 14, NOW).readyToShip).toBe(false)
  })
})

describe('fromPrice (38f) — "From ৳…" only when prices differ', () => {
  it('all variants at the base price → null (the card shows one price)', () => {
    expect(fromPrice([{ price: null }, { price: null }], d(2450))).toBeNull()
  })

  it('variants with their own prices → the lowest', () => {
    expect(
      fromPrice([{ price: d(2900) }, { price: null }, { price: d(3200) }], d(2450))?.toNumber(),
    ).toBe(2450)
    expect(fromPrice([{ price: d(2900) }, { price: d(2600) }], d(2450))?.toNumber()).toBe(2600)
  })

  it('a variant priced the same as the base is not a difference', () => {
    expect(fromPrice([{ price: d(2450) }, { price: null }], d(2450))).toBeNull()
  })

  it('no variants → null', () => {
    expect(fromPrice([], d(2450))).toBeNull()
  })
})
