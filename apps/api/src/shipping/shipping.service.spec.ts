import { Prisma } from '@nowoll/database'
import { resetDatabase, testPrisma } from '../../test/utils/test-db.js'
import type { PrismaService } from '../prisma/prisma.service.js'
import { ShippingService } from './shipping.service.js'

const prisma = testPrisma() as unknown as PrismaService
const service = new ShippingService(prisma)

beforeEach(() => resetDatabase())
afterAll(() => prisma.$disconnect())

describe('ShippingService.zoneFor', () => {
  beforeEach(async () => {
    await prisma.shippingZone.createMany({
      data: [
        {
          code: 'DHAKA',
          name: 'Inside Dhaka',
          districts: ['Dhaka', 'Narayanganj'],
          fee: new Prisma.Decimal(60),
        },
        {
          code: 'OUTSIDE_DHAKA',
          name: 'Outside Dhaka',
          districts: [],
          isDefault: true,
          fee: new Prisma.Decimal(120),
        },
      ],
    })
  })

  it('uses the zone that lists the district (any capitals, extra spaces)', async () => {
    expect((await service.zoneFor(prisma, ' narayanganj ')).code).toBe('DHAKA')
  })

  it('falls back to the default zone', async () => {
    expect((await service.zoneFor(prisma, 'Sylhet')).code).toBe('OUTSIDE_DHAKA')
  })

  it('ignores inactive zones (the admin switched "Inside Dhaka" off → default applies)', async () => {
    await prisma.shippingZone.update({ where: { code: 'DHAKA' }, data: { isActive: false } })
    expect((await service.zoneFor(prisma, 'Dhaka')).code).toBe('OUTSIDE_DHAKA')
  })
})
