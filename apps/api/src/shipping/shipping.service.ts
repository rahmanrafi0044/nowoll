import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import type { Prisma, ShippingZone } from '@nowoll/database'
import { DISTRICTS, slugify } from '@nowoll/validation'
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

/** Admin → Shipping (step 37): every zone, switched-off ones included. */
export interface AdminShippingZone extends ShippingRate {
  isActive: boolean
  updatedAt: Date
}

const toAdmin = (z: ShippingZone): AdminShippingZone => ({
  ...toRate(z),
  isActive: z.isActive,
  updatedAt: z.updatedAt,
})

/** What a create / edit may change (see the DTOs). */
export interface ZoneChanges {
  name?: string
  fee?: number
  freeShippingThreshold?: number | null
  estimatedDaysMin?: number | null
  estimatedDaysMax?: number | null
  districts?: string[]
  isActive?: boolean
  isDefault?: boolean
  /** Move districts that sit in another zone here, instead of refusing. */
  moveDistricts?: boolean
}

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

  // ── Admin (step 37) ────────────────────────────────────────────────────

  /** GET /admin/shipping/zones — the listed zones first, the default (catch-all) last. */
  async adminZones(): Promise<AdminShippingZone[]> {
    const zones = await this.prisma.shippingZone.findMany({
      orderBy: [{ isDefault: 'asc' }, { name: 'asc' }],
    })
    return zones.map(toAdmin)
  }

  createZone(changes: ZoneChanges & { name: string; fee: number; districts: string[] }) {
    return this.save(null, changes)
  }

  updateZone(id: string, changes: ZoneChanges) {
    return this.save(id, changes)
  }

  /**
   * One transaction, so the zones are never left half-changed. The rules
   * that keep checkout working:
   *   • exactly ONE default zone, and it is always on → every district has a fee
   *   • a district is in ONE zone at most → no doubt about which fee applies
   * No delete on purpose: orders point to their zone (switch it off instead).
   */
  private save(id: string | null, changes: ZoneChanges): Promise<AdminShippingZone> {
    return this.prisma.$transaction(async (tx) => {
      const zones = await tx.shippingZone.findMany()
      const current = id === null ? null : zones.find((z) => z.id === id)
      if (current === undefined) throw new NotFoundException('Delivery zone not found')

      const pick = <T>(value: T | undefined, fallback: T): T =>
        value === undefined ? fallback : value
      const next = {
        name: pick(changes.name, current?.name ?? ''),
        fee: pick(changes.fee, current?.fee.toNumber() ?? 0),
        freeShippingThreshold: pick(
          changes.freeShippingThreshold,
          current?.freeShippingThreshold?.toNumber() ?? null,
        ),
        estimatedDaysMin: pick(changes.estimatedDaysMin, current?.estimatedDaysMin ?? null),
        estimatedDaysMax: pick(changes.estimatedDaysMax, current?.estimatedDaysMax ?? null),
        // Kept in the official order, so lists always read the same way.
        districts: DISTRICTS.filter((d) =>
          pick(changes.districts, current?.districts ?? []).includes(d),
        ) as string[],
        isActive: pick(changes.isActive, current?.isActive ?? true),
        isDefault: pick(changes.isDefault, current?.isDefault ?? false),
      }

      if (
        next.estimatedDaysMin !== null &&
        next.estimatedDaysMax !== null &&
        next.estimatedDaysMin > next.estimatedDaysMax
      )
        throw new BadRequestException('Delivery time: “from” can’t be more days than “to”.')
      if (current?.isDefault && !next.isDefault)
        throw new BadRequestException(
          'There must always be a default zone. Make another zone the default instead.',
        )
      if (next.isDefault && !next.isActive)
        throw new BadRequestException(
          'The default zone can’t be switched off — every district needs a delivery fee. Make another zone the default first.',
        )

      const others = zones.filter((z) => z.id !== id)
      const sameName = others.find(
        (z) => z.name.trim().toLowerCase() === next.name.trim().toLowerCase(),
      )
      if (sameName)
        throw new ConflictException(
          `Another zone is already called “${sameName.name}” — customers couldn’t tell them apart.`,
        )

      const clashes = next.districts.flatMap((d) => {
        const owner = others.find((z) => z.districts.includes(d))
        return owner ? [{ district: d, owner }] : []
      })
      if (clashes.length > 0 && !changes.moveDistricts)
        throw new ConflictException({
          code: 'DISTRICT_IN_OTHER_ZONE',
          message: 'Some districts are already in another zone. Move them here?',
          details: clashes.map((c) => `${c.district} is in ${c.owner.name}`),
        })
      for (const owner of new Set(clashes.map((c) => c.owner))) {
        await tx.shippingZone.update({
          where: { id: owner.id },
          data: { districts: owner.districts.filter((d) => !next.districts.includes(d)) },
        })
      }

      // One default: making this one the default stops the old one being it.
      if (next.isDefault)
        await tx.shippingZone.updateMany({
          where: { isDefault: true, ...(id && { id: { not: id } }) },
          data: { isDefault: false },
        })

      const saved = current
        ? await tx.shippingZone.update({ where: { id: current.id }, data: next })
        : await tx.shippingZone.create({
            data: {
              ...next,
              code: uniqueCode(
                next.name,
                zones.map((z) => z.code),
              ),
            },
          })
      return toAdmin(saved)
    })
  }
}

/** "Dhaka suburbs" → "DHAKA_SUBURBS" (or "…_2" if taken). Internal only. */
function uniqueCode(name: string, taken: string[]): string {
  const base = slugify(name).replace(/-/g, '_').toUpperCase() || 'ZONE'
  let code = base
  for (let n = 2; taken.includes(code); n++) code = `${base}_${n}`
  return code
}
