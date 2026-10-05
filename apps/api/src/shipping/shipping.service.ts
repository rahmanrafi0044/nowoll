import { Injectable, ServiceUnavailableException } from '@nestjs/common'
import type { Prisma, ShippingZone } from '@nowoll/database'
import { PrismaService } from '../prisma/prisma.service.js'

type Db = Prisma.TransactionClient | PrismaService

export interface ShippingRate {
  id: string
  code: string
  name: string
  fee: Prisma.Decimal
  freeShippingThreshold: Prisma.Decimal | null
  estimatedDaysMin: number | null
  estimatedDaysMax: number | null
  districts: string[]
  isDefault: boolean
}

const toRate = (z: ShippingZone): ShippingRate => ({
  id: z.id,
  code: z.code,
  name: z.name,
  fee: z.fee,
  freeShippingThreshold: z.freeShippingThreshold,
  estimatedDaysMin: z.estimatedDaysMin,
  estimatedDaysMax: z.estimatedDaysMax,
  districts: z.districts,
  isDefault: z.isDefault,
})

@Injectable()
export class ShippingService {
  constructor(private readonly prisma: PrismaService) {}

  /** GET /shipping/rates — the active zones and their fees (public). */
  async rates(): Promise<ShippingRate[]> {
    const zones = await this.prisma.shippingZone.findMany({
      where: { isActive: true },
      orderBy: [{ isDefault: 'asc' }, { name: 'asc' }],
    })
    return zones.map(toRate)
  }

  /**
   * Which zone delivers to a district: the zone that LISTS the district
   * (e.g. Inside Dhaka lists "Dhaka"), otherwise the catch-all default zone
   * (Outside Dhaka). Zones and their districts are edited by the admin, never in code.
   */
  async zoneFor(db: Db, district: string): Promise<ShippingRate> {
    const zones = await db.shippingZone.findMany({ where: { isActive: true } })
    const wanted = district.trim().toLowerCase()
    const listed = zones.find((z) => z.districts.some((d) => d.trim().toLowerCase() === wanted))
    const zone = listed ?? zones.find((z) => z.isDefault)
    if (!zone) {
      // A setup problem (no active default zone), not the customer's fault.
      throw new ServiceUnavailableException(
        'Delivery to this district is not available right now. Please contact us.',
      )
    }
    return toRate(zone)
  }
}
