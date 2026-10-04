import { resetDatabase, testPrisma } from '../../test/utils/test-db.js'
import type { PrismaService } from '../prisma/prisma.service.js'
import { SettingsService } from './settings.service.js'

const prisma = testPrisma() as unknown as PrismaService
const service = new SettingsService(prisma)

beforeEach(() => resetDatabase())
afterAll(() => prisma.$disconnect())

describe('SettingsService.lowStockThreshold', () => {
  it('reads the value from the settings table', async () => {
    await prisma.setting.create({ data: { key: 'low_stock_threshold', value: 12 } })
    expect(await service.lowStockThreshold()).toBe(12)
  })

  it.each([
    ['missing', undefined],
    ['text', 'five'],
    ['negative', -1],
    ['decimal', 2.5],
  ])('falls back to 5 when the setting is %s (decision #4)', async (_label, value) => {
    if (value !== undefined)
      await prisma.setting.create({ data: { key: 'low_stock_threshold', value } })
    expect(await service.lowStockThreshold()).toBe(5)
  })
})
