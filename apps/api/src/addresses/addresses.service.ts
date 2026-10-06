import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import type { Prisma } from '@nowoll/database'
import { isDistrictInDivision } from '@nowoll/validation'
import { PrismaService } from '../prisma/prisma.service.js'
import type { CreateAddressDto, UpdateAddressDto } from './dto/address.dto.js'

/** Saved addresses per customer — enough for home, office, parents… */
export const MAX_ADDRESSES = 10

export interface SavedAddress {
  id: string
  label: string | null
  fullName: string
  phone: string
  addressLine1: string
  addressLine2: string | null
  area: string | null
  district: string
  division: string
  postalCode: string | null
  isDefault: boolean
}

const select = {
  id: true,
  label: true,
  fullName: true,
  phone: true,
  addressLine1: true,
  addressLine2: true,
  area: true,
  district: true,
  division: true,
  postalCode: true,
  isDefault: true,
} satisfies Prisma.AddressSelect

// ============================================================================
// Saved addresses (step 23). One rule above all: while a customer has any
// addresses, EXACTLY ONE is the default (the one checkout starts with).
//
// Every change runs in a transaction that first LOCKS the customer's users
// row (SELECT … FOR UPDATE). Two changes at the same moment — "make A
// default" in one tab, "make B default" in another — then take turns instead
// of both succeeding and leaving two defaults.
//
// Deleting is a real delete (not soft): orders keep their own COPY of the
// address, so removing a saved one changes no order.
// ============================================================================
@Injectable()
export class AddressesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Default first, then newest. */
  list(userId: string): Promise<SavedAddress[]> {
    return this.prisma.address.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
      select,
    })
  }

  async create(userId: string, dto: CreateAddressDto): Promise<SavedAddress> {
    checkDistrict(dto.district, dto.division)
    return this.prisma.$transaction(async (tx) => {
      await lockCustomer(tx, userId)
      const count = await tx.address.count({ where: { userId } })
      if (count >= MAX_ADDRESSES)
        throw new ConflictException({
          message: `You can save up to ${MAX_ADDRESSES} addresses. Remove one to add another.`,
          code: 'ADDRESS_LIMIT',
        })
      const makeDefault = count === 0 || dto.isDefault === true // the first one is always the default
      if (makeDefault)
        await tx.address.updateMany({ where: { userId }, data: { isDefault: false } })
      const { isDefault: _ignored, ...fields } = dto
      return tx.address.create({ data: { ...fields, userId, isDefault: makeDefault }, select })
    })
  }

  async update(userId: string, id: string, dto: UpdateAddressDto): Promise<SavedAddress> {
    return this.prisma.$transaction(async (tx) => {
      await lockCustomer(tx, userId)
      const current = await tx.address.findFirst({ where: { id, userId } })
      if (!current) throw new NotFoundException('Address not found') // someone else's looks missing too
      checkDistrict(dto.district ?? current.district, dto.division ?? current.division)

      const { isDefault, ...fields } = dto
      if (isDefault === true && !current.isDefault)
        await tx.address.updateMany({ where: { userId }, data: { isDefault: false } })
      // Un-defaulting the default hands the role to the newest other address
      // (with no other address, it simply stays the default).
      const handOver =
        isDefault === false && current.isDefault ? await newestOther(tx, userId, id) : null
      if (handOver) await tx.address.update({ where: { id: handOver }, data: { isDefault: true } })

      return tx.address.update({
        where: { id },
        data: {
          ...fields,
          ...(isDefault === true && { isDefault: true }),
          ...(handOver && { isDefault: false }),
        },
        select,
      })
    })
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await lockCustomer(tx, userId)
      const current = await tx.address.findFirst({ where: { id, userId } })
      if (!current) throw new NotFoundException('Address not found')
      await tx.address.delete({ where: { id } })
      if (current.isDefault) {
        const next = await newestOther(tx, userId, id)
        if (next) await tx.address.update({ where: { id: next }, data: { isDefault: true } })
      }
    })
  }
}

function checkDistrict(district: string, division: string) {
  if (!isDistrictInDivision(district, division))
    throw new BadRequestException(`${district} is not in ${division} division.`)
}

async function lockCustomer(tx: Prisma.TransactionClient, userId: string) {
  await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`
}

async function newestOther(tx: Prisma.TransactionClient, userId: string, exceptId: string) {
  const other = await tx.address.findFirst({
    where: { userId, id: { not: exceptId } },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  })
  return other?.id ?? null
}
