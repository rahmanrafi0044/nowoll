// StockService against the real test database — including REAL concurrency:
// many transactions hitting the same variant at the same moment.
import { ConflictException, NotFoundException } from '@nestjs/common'
import { makeCategory, makeProduct } from '../../test/utils/factories.js'
import { makeStockService } from '../../test/utils/services.js'
import { resetDatabase, testPrisma } from '../../test/utils/test-db.js'
import type { PrismaService } from '../prisma/prisma.service.js'
import type { AdjustStockInput, StockChange } from './stock.service.js'

const prisma = testPrisma() as unknown as PrismaService
let { stock, alerter } = makeStockService(prisma)

beforeEach(async () => {
  await resetDatabase()
  ;({ stock, alerter } = makeStockService(prisma))
  await prisma.setting.create({ data: { key: 'low_stock_threshold', value: 5 } })
})
afterAll(() => prisma.$disconnect())

/** Runs one adjustment in its own transaction, then fires alerts — like the services do. */
async function adjust(
  input: Omit<AdjustStockInput, 'reason'> & Partial<Pick<AdjustStockInput, 'reason'>>,
) {
  const change = await prisma.$transaction((tx) =>
    stock.adjust(tx, { reason: 'MANUAL_ADJUSTMENT', note: 'test', ...input }),
  )
  await stock.notifyLowStock([change])
  return change
}

async function variantWith(
  stockLevel: number,
  fields: Parameters<typeof makeProduct>[0] extends infer P ? Partial<P> : never = {},
) {
  const c = await makeCategory()
  const p = await makeProduct({
    categoryId: c.id,
    variants: [{ size: 'M', color: 'Blue', stock: stockLevel }],
    ...fields,
  })
  return p.variants[0]!
}

const stockOf = async (id: string) =>
  (await prisma.productVariant.findUniqueOrThrow({ where: { id } })).stock

describe('StockService.adjust — add/remove mode', () => {
  it('adds and removes, logging each change with the exact stock after', async () => {
    const v = await variantWith(10)
    expect(await adjust({ variantId: v.id, adjustment: { change: 5 } })).toMatchObject({
      before: 10,
      after: 15,
      change: 5,
    })
    expect(await adjust({ variantId: v.id, adjustment: { change: -3 } })).toMatchObject({
      before: 15,
      after: 12,
      change: -3,
    })

    const logs = await prisma.inventoryLog.findMany({ orderBy: { createdAt: 'asc' } })
    expect(logs.map((l) => [l.change, l.stockAfter, l.reason, l.note])).toEqual([
      [5, 15, 'MANUAL_ADJUSTMENT', 'test'],
      [-3, 12, 'MANUAL_ADJUSTMENT', 'test'],
    ])
  })

  it('refuses to go below zero — and changes and logs nothing', async () => {
    const v = await variantWith(3)
    await expect(adjust({ variantId: v.id, adjustment: { change: -4 } })).rejects.toThrow(
      new ConflictException("Can't remove 4: only 3 in stock."),
    )
    expect(await stockOf(v.id)).toBe(3)
    expect(await prisma.inventoryLog.count()).toBe(0)
  })

  it('404s for unknown and archived variants', async () => {
    const v = await variantWith(3)
    await prisma.productVariant.update({ where: { id: v.id }, data: { deletedAt: new Date() } })
    for (const id of [v.id, '00000000-0000-0000-0000-000000000000']) {
      await expect(adjust({ variantId: id, adjustment: { change: 1 } })).rejects.toBeInstanceOf(
        NotFoundException,
      )
      await expect(adjust({ variantId: id, adjustment: { setTo: 1 } })).rejects.toBeInstanceOf(
        NotFoundException,
      )
    }
  })
})

describe('StockService.adjust — set-to mode', () => {
  it('sets an exact count and logs the difference', async () => {
    const v = await variantWith(10)
    expect(await adjust({ variantId: v.id, adjustment: { setTo: 4 } })).toMatchObject({
      before: 10,
      after: 4,
      change: -6,
    })
    expect(await prisma.inventoryLog.findFirst()).toMatchObject({ change: -6, stockAfter: 4 })
  })

  it('logs nothing when the count is already right', async () => {
    const v = await variantWith(7)
    expect(await adjust({ variantId: v.id, adjustment: { setTo: 7 } })).toMatchObject({
      change: 0,
      logId: null,
    })
    expect(await prisma.inventoryLog.count()).toBe(0)
  })
})

describe('StockService — concurrency (many requests at the same moment)', () => {
  it('20 simultaneous "remove 1" on stock 10: exactly 10 succeed, stock ends at 0, never negative', async () => {
    const v = await variantWith(10)
    const results = await Promise.allSettled(
      Array.from({ length: 20 }, () => adjust({ variantId: v.id, adjustment: { change: -1 } })),
    )
    const succeeded = results.filter(
      (r) => r.status === 'fulfilled',
    ) as PromiseFulfilledResult<StockChange>[]
    expect(succeeded).toHaveLength(10)
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(10)
    expect(await stockOf(v.id)).toBe(0)

    // Every successful change saw a different, exact "after" value: 9, 8, … 0
    const logs = await prisma.inventoryLog.findMany()
    expect(logs.map((l) => l.stockAfter).sort((a, b) => a - b)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9,
    ])
  })

  it('mixed simultaneous "set to" and "add" changes: the history always adds up to the final stock', async () => {
    const v = await variantWith(50)
    await Promise.all([
      ...Array.from({ length: 10 }, () => adjust({ variantId: v.id, adjustment: { change: -2 } })),
      ...Array.from({ length: 5 }, (_, i) =>
        adjust({ variantId: v.id, adjustment: { setTo: 100 + i } }),
      ),
      ...Array.from({ length: 10 }, () => adjust({ variantId: v.id, adjustment: { change: 3 } })),
    ])
    const logs = await prisma.inventoryLog.findMany()
    const total = logs.reduce((sum, l) => sum + l.change, 0)
    // No lost updates: start + every logged change = what's actually in the database
    expect(50 + total).toBe(await stockOf(v.id))
  })
})

describe('StockService — low-stock alerts', () => {
  it('alerts once, when the stock crosses the threshold (store setting = 5)', async () => {
    const v = await variantWith(7)
    await adjust({ variantId: v.id, adjustment: { change: -1 } }) // 6: still above
    await adjust({ variantId: v.id, adjustment: { change: -1 } }) // 5: crossed → alert
    await adjust({ variantId: v.id, adjustment: { change: -1 } }) // 4: already low → no new alert
    expect(alerter.alerts).toEqual([
      expect.objectContaining({
        variantId: v.id,
        stock: 5,
        threshold: 5,
        variantLabel: 'M / Blue',
      }),
    ])
  })

  it('alerts again after a restock lifts it back above the threshold', async () => {
    const v = await variantWith(6)
    await adjust({ variantId: v.id, adjustment: { change: -2 } }) // 4 → alert
    await adjust({ variantId: v.id, adjustment: { setTo: 20 } }) // restocked
    await adjust({ variantId: v.id, adjustment: { setTo: 3 } }) // 3 → alert again
    expect(alerter.alerts.map((a) => a.stock)).toEqual([4, 3])
  })

  it("uses the variant's own threshold when it has one", async () => {
    const v = await variantWith(12)
    await prisma.productVariant.update({ where: { id: v.id }, data: { lowStockThreshold: 10 } })
    await adjust({ variantId: v.id, adjustment: { change: -2 } })
    expect(alerter.alerts).toEqual([expect.objectContaining({ stock: 10, threshold: 10 })])
  })

  it('never alerts for drafts or inactive variants (decision #2)', async () => {
    const draft = await variantWith(6, { status: 'DRAFT' })
    const inactive = await variantWith(6)
    await prisma.productVariant.update({ where: { id: inactive.id }, data: { isActive: false } })
    await adjust({ variantId: draft.id, adjustment: { change: -3 } })
    await adjust({ variantId: inactive.id, adjustment: { change: -3 } })
    expect(alerter.alerts).toEqual([])
  })

  it('does not alert if the transaction rolls back (the change never really happened)', async () => {
    const v = await variantWith(6)
    const changes: StockChange[] = []
    await expect(
      prisma.$transaction(async (tx) => {
        changes.push(
          await stock.adjust(tx, {
            variantId: v.id,
            adjustment: { change: -3 },
            reason: 'MANUAL_ADJUSTMENT',
          }),
        )
        throw new Error('something later in the same transaction failed')
      }),
    ).rejects.toThrow()
    // Callers only notify after a successful commit, so nothing is sent:
    expect(alerter.alerts).toEqual([])
    expect(await stockOf(v.id)).toBe(6)
    expect(await prisma.inventoryLog.count()).toBe(0)
  })

  it('a failing alerter never breaks the stock change', async () => {
    const v = await variantWith(6)
    const failing = makeStockService(prisma, {
      alerts: [],
      notify: async () => {
        throw new Error('queue down')
      },
    })
    const change = await prisma.$transaction((tx) =>
      failing.stock.adjust(tx, {
        variantId: v.id,
        adjustment: { change: -2 },
        reason: 'MANUAL_ADJUSTMENT',
      }),
    )
    await expect(failing.stock.notifyLowStock([change])).resolves.toBeUndefined()
    expect(await stockOf(v.id)).toBe(4)
  })
})
