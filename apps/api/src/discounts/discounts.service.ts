import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common'
import { type DiscountCode, Prisma } from '@nowoll/database'
import { DiscountType } from '@nowoll/database/enums'
import type { AdminDiscountDetail, DiscountStatus, Paginated } from '@nowoll/types'
import { SALE_STATUSES } from '../analytics/analytics.service.js'
import { displayNumber } from '../orders/order-number.js'
import { PrismaService } from '../prisma/prisma.service.js'
import { priceCart } from '../pricing/cart-pricing.js'
import {
  discountAmount,
  type DiscountRefusal,
  normalizeCode,
  refusalFor,
} from './discount-rules.js'
import type { CreateDiscountDto } from './dto/create-discount.dto.js'
import type { UpdateDiscountDto } from './dto/update-discount.dto.js'
import type { ValidateDiscountDto } from './dto/validate-discount.dto.js'

type Db = Prisma.TransactionClient | PrismaService

export interface DiscountPreview {
  code: string
  type: DiscountType
  value: Prisma.Decimal
  subtotal: Prisma.Decimal
  discountAmount: Prisma.Decimal
  subtotalAfterDiscount: Prisma.Decimal
}

export interface AdminDiscount extends DiscountCode {
  totalDiscounted: Prisma.Decimal // sum of discounts given with this code
  salesTotal: Prisma.Decimal // totals of SALES (confirmed or later) that used it (step 34)
  status: DiscountStatus
}

/**
 * One status per code, decided in this order (the first that applies):
 * off → expired → used up → scheduled → active. The list filter
 * (statusWhere) follows exactly the same order.
 */
export function discountStatus(
  c: Pick<DiscountCode, 'isActive' | 'startsAt' | 'expiresAt' | 'usageLimit' | 'usedCount'>,
  now = new Date(),
): DiscountStatus {
  if (!c.isActive) return 'OFF'
  if (c.expiresAt && c.expiresAt <= now) return 'EXPIRED'
  if (c.usageLimit !== null && c.usedCount >= c.usageLimit) return 'USED_UP'
  if (c.startsAt && c.startsAt > now) return 'SCHEDULED'
  return 'ACTIVE'
}

const toDecimal = (n: number) => new Prisma.Decimal(n.toFixed(2))
const decimalOrNull = (n: number | null | undefined) =>
  n === undefined ? undefined : n === null ? null : toDecimal(n)

const refuse = (r: DiscountRefusal): never => {
  throw new UnprocessableEntityException({ message: r.message, code: r.code })
}

@Injectable()
export class DiscountsService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Public ─────────────────────────────────────────────────────────────

  /**
   * POST /discounts/validate — "what would this code take off my bag?"
   * A PREVIEW only: nothing is reserved or counted. The code is applied for
   * real (and its use counted) inside the order transaction — see redeem().
   */
  async preview(dto: ValidateDiscountDto): Promise<DiscountPreview> {
    const { subtotal } = await priceCart(this.prisma, dto.items)
    const result = await this.evaluate(this.prisma, dto.code, subtotal, dto.email)
    if (!result.ok) return refuse(result.refusal)
    return {
      code: result.code,
      type: result.type,
      value: result.value,
      subtotal,
      discountAmount: result.amount,
      subtotalAfterDiscount: subtotal.minus(result.amount),
    }
  }

  /**
   * "Would this code work on this subtotal, and for how much?" — without
   * counting a use. Shared by the cart preview and the checkout quote, so
   * both apply exactly the same rules.
   */
  async evaluate(
    db: Db,
    rawCode: string,
    subtotal: Prisma.Decimal,
    email?: string,
  ): Promise<
    | { ok: true; code: string; type: DiscountType; value: Prisma.Decimal; amount: Prisma.Decimal }
    | { ok: false; refusal: DiscountRefusal }
  > {
    const code = await this.findByCode(db, rawCode)
    const refusal = refusalFor(code, subtotal, new Date())
    if (refusal) return { ok: false, refusal }
    if (email) {
      const limit = await this.customerLimitRefusal(db, code!, email)
      if (limit) return { ok: false, refusal: limit }
    }
    return {
      ok: true,
      code: code!.code,
      type: code!.type,
      value: code!.value,
      amount: discountAmount(code!, subtotal),
    }
  }

  // ── Used by the orders module (step 18), inside its transaction ─────────

  /**
   * Applies a code to an order FOR REAL and counts the use. Call inside the
   * order-creation transaction: if anything later fails, the use is rolled
   * back with everything else.
   *
   * The LAST use of a limited code can't be taken twice: the count goes up in
   * ONE statement, only if uses remain ("used_count < usage_limit"). That
   * statement also locks the code's row, so two orders by the same customer
   * are checked against the per-customer limit one after the other.
   */
  async redeem(
    tx: Prisma.TransactionClient,
    input: {
      code: string
      orderId: string
      email: string
      userId?: string | null
      subtotal: Prisma.Decimal
    },
  ): Promise<{ discountCodeId: string; code: string; amount: Prisma.Decimal }> {
    const code = await this.findByCode(tx, input.code)
    const refusal = refusalFor(code, input.subtotal, new Date())
    if (refusal) refuse(refusal)

    const claimed = await tx.$executeRaw`
      UPDATE discount_codes SET used_count = used_count + 1, updated_at = now()
      WHERE id = ${code!.id}::uuid AND (usage_limit IS NULL OR used_count < usage_limit)`
    if (claimed === 0)
      refuse({ code: 'DISCOUNT_USED_UP', message: 'This code has been fully used.' })

    const email = input.email.trim().toLowerCase()
    await this.assertCustomerLimit(tx, code!, email)

    const amount = discountAmount(code!, input.subtotal)
    await tx.discountUsage.create({
      data: {
        discountCodeId: code!.id,
        orderId: input.orderId,
        email,
        userId: input.userId ?? null,
        amount,
      },
    })
    return { discountCodeId: code!.id, code: code!.code, amount }
  }

  /**
   * Gives a use back when the order's payment fails or the order is cancelled
   * (decision #3) — the customer shouldn't lose a one-time code because a
   * payment didn't go through. Safe to call for orders without a code.
   */
  async release(tx: Prisma.TransactionClient, orderId: string): Promise<void> {
    const usage = await tx.discountUsage.findUnique({ where: { orderId } })
    if (!usage) return
    await tx.discountUsage.delete({ where: { id: usage.id } })
    await tx.$executeRaw`
      UPDATE discount_codes SET used_count = GREATEST(used_count - 1, 0), updated_at = now()
      WHERE id = ${usage.discountCodeId}::uuid`
  }

  // ── Admin ──────────────────────────────────────────────────────────────

  async list(
    query: { page: number; pageSize: number; q?: string; status?: DiscountStatus },
    now = new Date(),
  ): Promise<Paginated<AdminDiscount>> {
    const where: Prisma.DiscountCodeWhereInput = {
      deletedAt: null,
      ...(query.q && { code: { contains: query.q.trim().toUpperCase() } }),
      ...(query.status && this.statusWhere(query.status, now)),
    }
    const [total, codes] = await Promise.all([
      this.prisma.discountCode.count({ where }),
      this.prisma.discountCode.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ])
    const ids = codes.map((c) => c.id)
    const [sums, sales] = await Promise.all([
      this.prisma.discountUsage.groupBy({
        by: ['discountCodeId'],
        where: { discountCodeId: { in: ids } },
        _sum: { amount: true },
      }),
      this.prisma.order.groupBy({
        by: ['discountCodeId'],
        where: { discountCodeId: { in: ids }, status: { in: SALE_STATUSES } },
        _sum: { total: true },
      }),
    ])
    const sumById = new Map(sums.map((s) => [s.discountCodeId, s._sum.amount]))
    const salesById = new Map(sales.map((s) => [s.discountCodeId, s._sum.total]))
    return {
      items: codes.map((c) => ({
        ...c,
        totalDiscounted: sumById.get(c.id) ?? new Prisma.Decimal(0),
        salesTotal: salesById.get(c.id) ?? new Prisma.Decimal(0),
        status: discountStatus(c, now),
      })),
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.ceil(total / query.pageSize),
    }
  }

  /** GET /discounts/:id — the code (archived ones too) and the orders that used it. */
  async detail(id: string, now = new Date()): Promise<AdminDiscountDetail> {
    const c = await this.prisma.discountCode.findUnique({ where: { id } })
    if (!c) throw new NotFoundException('Discount code not found')
    const [usages, totals, sales] = await Promise.all([
      this.prisma.discountUsage.findMany({
        where: { discountCodeId: id },
        include: {
          order: {
            select: { id: true, orderNumber: true, customerName: true, total: true, status: true },
          },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        take: 100,
      }),
      this.prisma.discountUsage.aggregate({
        where: { discountCodeId: id },
        _sum: { amount: true },
      }),
      this.prisma.order.aggregate({
        where: { discountCodeId: id, status: { in: SALE_STATUSES } },
        _sum: { total: true },
      }),
    ])
    const money = (d: Prisma.Decimal | null | undefined) => (d ?? new Prisma.Decimal(0)).toString()
    return {
      id: c.id,
      code: c.code,
      description: c.description,
      type: c.type,
      value: c.value.toString(),
      minOrderAmount: c.minOrderAmount?.toString() ?? null,
      maxDiscountAmount: c.maxDiscountAmount?.toString() ?? null,
      usageLimit: c.usageLimit,
      usageLimitPerCustomer: c.usageLimitPerCustomer,
      usedCount: c.usedCount,
      startsAt: c.startsAt?.toISOString() ?? null,
      expiresAt: c.expiresAt?.toISOString() ?? null,
      isActive: c.isActive,
      createdAt: c.createdAt.toISOString(),
      status: discountStatus(c, now),
      totalDiscounted: money(totals._sum.amount),
      salesTotal: money(sales._sum.total),
      usages: usages.map((u) => ({
        orderId: u.order.id,
        orderNumber: displayNumber(u.order.orderNumber),
        customerName: u.order.customerName,
        email: u.email,
        amount: u.amount.toString(),
        orderTotal: u.order.total.toString(),
        orderStatus: u.order.status,
        createdAt: u.createdAt.toISOString(),
      })),
    }
  }

  async create(dto: CreateDiscountDto): Promise<DiscountCode> {
    this.assertSensible(dto)
    await this.assertCodeFree(dto.code)
    return this.prisma.discountCode.create({
      data: this.toData(dto) as Prisma.DiscountCodeCreateInput,
    })
  }

  async update(id: string, dto: UpdateDiscountDto): Promise<DiscountCode> {
    const existing = await this.findAdminOrThrow(id)
    const merged = {
      type: dto.type ?? existing.type,
      value: dto.value ?? existing.value.toNumber(),
      maxDiscountAmount:
        dto.maxDiscountAmount !== undefined
          ? dto.maxDiscountAmount
          : existing.maxDiscountAmount?.toNumber(),
      startsAt: dto.startsAt !== undefined ? dto.startsAt : existing.startsAt,
      expiresAt: dto.expiresAt !== undefined ? dto.expiresAt : existing.expiresAt,
    }
    this.assertSensible(merged)

    // Decision #6: once used, the code text and type are fixed, so usage
    // reports keep meaning what they say. Archive it and make a new one instead.
    const changesCode = dto.code !== undefined && dto.code !== existing.code
    const changesType = dto.type !== undefined && dto.type !== existing.type
    if ((changesCode || changesType) && existing.usedCount > 0) {
      throw new ConflictException(
        `"${existing.code}" has already been used ${existing.usedCount} time(s), so its code and type can't change. Archive it and create a new code instead.`,
      )
    }
    if (changesCode) await this.assertCodeFree(dto.code!)

    return this.prisma.discountCode.update({ where: { id }, data: this.toData(dto) })
  }

  /** Soft delete: can't be used any more, but stays in reports and old orders. */
  async remove(id: string): Promise<{ id: string }> {
    await this.findAdminOrThrow(id)
    await this.prisma.discountCode.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    })
    return { id }
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  /** The list filter — the same order of checks as discountStatus(). */
  private statusWhere(status: DiscountStatus, now: Date): Prisma.DiscountCodeWhereInput {
    const notExpired = { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }
    // usedCount < usageLimit compares two columns (a "field reference").
    const usesLeft = {
      OR: [{ usageLimit: null }, { usedCount: { lt: this.prisma.discountCode.fields.usageLimit } }],
    }
    const usedUp = {
      usageLimit: { not: null },
      usedCount: { gte: this.prisma.discountCode.fields.usageLimit },
    }
    switch (status) {
      case 'OFF':
        return { isActive: false }
      case 'EXPIRED':
        return { isActive: true, expiresAt: { lte: now } }
      case 'USED_UP':
        return { isActive: true, AND: [notExpired, usedUp] }
      case 'SCHEDULED':
        return { isActive: true, startsAt: { gt: now }, AND: [notExpired, usesLeft] }
      case 'ACTIVE':
        return {
          isActive: true,
          AND: [notExpired, usesLeft, { OR: [{ startsAt: null }, { startsAt: { lte: now } }] }],
        }
    }
  }

  private findByCode(db: Db, code: string) {
    return db.discountCode.findUnique({ where: { code: normalizeCode(code) } })
  }

  private async findAdminOrThrow(id: string): Promise<DiscountCode> {
    const code = await this.prisma.discountCode.findFirst({ where: { id, deletedAt: null } })
    if (!code) throw new NotFoundException('Discount code not found')
    return code
  }

  private async customerLimitRefusal(
    db: Db,
    code: DiscountCode,
    email: string,
  ): Promise<DiscountRefusal | null> {
    if (code.usageLimitPerCustomer === null) return null
    const used = await db.discountUsage.count({
      where: { discountCodeId: code.id, email: { equals: email, mode: 'insensitive' } },
    })
    if (used < code.usageLimitPerCustomer) return null
    return {
      code: 'DISCOUNT_CUSTOMER_LIMIT',
      message:
        code.usageLimitPerCustomer === 1
          ? "You've already used this code."
          : `This code can be used ${code.usageLimitPerCustomer} times per customer.`,
    }
  }

  private async assertCustomerLimit(db: Db, code: DiscountCode, email: string): Promise<void> {
    const refusal = await this.customerLimitRefusal(db, code, email)
    if (refusal) refuse(refusal)
  }

  private async assertCodeFree(code: string): Promise<void> {
    const taken = await this.prisma.discountCode.findUnique({
      where: { code },
      select: { deletedAt: true },
    })
    if (taken) {
      throw new ConflictException(
        taken.deletedAt
          ? `"${code}" belongs to an archived code. Choose another.`
          : `"${code}" already exists.`,
      )
    }
  }

  private assertSensible(d: {
    type: DiscountType
    value: number
    maxDiscountAmount?: number | null
    startsAt?: Date | null
    expiresAt?: Date | null
  }): void {
    if (d.type === DiscountType.PERCENTAGE && d.value > 100) {
      throw new BadRequestException('A percentage discount can be at most 100.')
    }
    if (d.type === DiscountType.FIXED_AMOUNT && d.maxDiscountAmount != null) {
      throw new BadRequestException('maxDiscountAmount only applies to PERCENTAGE codes.')
    }
    if (d.startsAt && d.expiresAt && d.expiresAt <= d.startsAt) {
      throw new BadRequestException('expiresAt must be after startsAt.')
    }
  }

  private toData(dto: UpdateDiscountDto): Prisma.DiscountCodeUpdateInput {
    const { value, minOrderAmount, maxDiscountAmount, ...rest } = dto
    return {
      ...rest,
      ...(value !== undefined && { value: toDecimal(value) }),
      minOrderAmount: decimalOrNull(minOrderAmount),
      maxDiscountAmount: decimalOrNull(maxDiscountAmount),
    }
  }
}
