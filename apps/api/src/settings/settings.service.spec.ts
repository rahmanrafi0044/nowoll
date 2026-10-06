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

describe('SettingsService.vatRate', () => {
  it('reads the rate', async () => {
    await prisma.setting.create({ data: { key: 'vat_rate', value: 7.5 } })
    expect(await service.vatRate()).toBe(7.5)
  })

  it.each([
    ['missing', undefined],
    ['text', '7.5'],
    ['over 100', 150],
    ['negative', -1],
  ])('charges 0%% when the setting is %s (never an unknown tax)', async (_label, value) => {
    if (value !== undefined) await prisma.setting.create({ data: { key: 'vat_rate', value } })
    expect(await service.vatRate()).toBe(0)
  })
})

describe('SettingsService.returnWindowDays', () => {
  it('reads the value; 0 switches returns off', async () => {
    await prisma.setting.create({ data: { key: 'return_window_days', value: 14 } })
    expect(await service.returnWindowDays()).toBe(14)
    await prisma.setting.update({ where: { key: 'return_window_days' }, data: { value: 0 } })
    expect(await service.returnWindowDays()).toBe(0)
  })

  it.each([
    ['missing', undefined],
    ['text', '7'],
    ['negative', -1],
    ['too long', 365],
  ])('falls back to 7 when the setting is %s', async (_label, value) => {
    if (value !== undefined)
      await prisma.setting.create({ data: { key: 'return_window_days', value } })
    expect(await service.returnWindowDays()).toBe(7)
  })
})
