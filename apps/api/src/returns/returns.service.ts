import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { Prisma } from '@nowoll/database'
import { InventoryChangeReason, OrderStatus, ReturnStatus } from '@nowoll/database/enums'
import type { Paginated } from '@nowoll/types'
import { type StockChange, StockService } from '../inventory/stock.service.js'
import { displayNumber } from '../orders/order-number.js'
import { parseOrderNumber } from '../orders/order-lookup.service.js'
import { stockLockOrder } from '../orders/orders.service.js'
import { PrismaService } from '../prisma/prisma.service.js'
import { SettingsService } from '../settings/settings.service.js'
import type { ReceiveReturnDto, RequestReturnDto, ReturnReason } from './dto/return.dto.js'

export const ADMIN_PAGE_SIZE = 20

export interface ReturnLine {
  orderItemId: string
  productName: string
  variantLabel: string
  imageUrl: string | null
  quantity: number
  restock: boolean
}

/** A return request as the customer sees it. */
export interface MyReturn {
  id: string
  orderNumber: string // "NW-10001"
  status: ReturnStatus
  reason: ReturnReason
  customerNote: string | null
  adminNote: string | null // approval instructions
  rejectionReason: string | null
  refundAmount: Prisma.Decimal | null
  items: ReturnLine[]
  createdAt: Date
  approvedAt: Date | null
  rejectedAt: Date | null
}

/** What can still be returned from an order (the order page's "Return items"). */
export interface ReturnEligibility {
  canReturn: boolean
  /** Why not, in the customer's words (null when they can). */
  reason: string | null
  windowClosesAt: Date | null
  items: {
    orderItemId: string
    productName: string
    variantLabel: string
    imageUrl: string | null
    bought: number
    returnable: number // bought − already returned or asked for (rejected requests don't count)
  }[]
}

export interface AdminReturn extends MyReturn {
  orderId: string
  customer: { id: string; name: string | null; email: string; phone: string }
  paymentMethod: string
  /** The returned items' share of what was paid (decision #5) — the admin may change it. */
  suggestedRefund: Prisma.Decimal
  /** Paid minus already refunded (or being refunded) — the most a refund may be. */
  maxRefundable: Prisma.Decimal
  refunds: {
    id: string
    amount: Prisma.Decimal
    status: string
    gatewayRefId: string | null
    createdAt: Date
  }[]
}

const include = {
  order: { select: { orderNumber: true } },
  items: { include: { orderItem: true } },
} satisfies Prisma.ReturnRequestInclude

type FullReturn = Prisma.ReturnRequestGetPayload<{ include: typeof include }>

// ============================================================================
// Returns (Phase 4 step 25):
//   REQUESTED → APPROVED (customer told how to send it back)
//             → RECEIVED (parcel arrived; restock what's sellable)
//             → REFUNDED (refunds.service.ts)
//   REQUESTED → REJECTED (with a reason the customer sees)
// Every step checks the CURRENT status inside a transaction, so steps can't
// be skipped or repeated (e.g. restocking the same parcel twice).
// ============================================================================
@Injectable()
export class ReturnsService {
  private readonly logger = new Logger(ReturnsService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly stock: StockService,
  ) {}

  /** GET /returns/eligibility/:orderNumber */
  async eligibility(userId: string, number: string, now = new Date()): Promise<ReturnEligibility> {
    const order = await this.myOrder(userId, number)
    const returned = await this.alreadyReturned(this.prisma, order.id)
    const items = order.items.map((i) => ({
      orderItemId: i.id,
      productName: i.productName,
      variantLabel: i.variantLabel,
      imageUrl: i.imageUrl,
      bought: i.quantity,
      returnable: Math.max(0, i.quantity - (returned.get(i.id) ?? 0)),
    }))
    const { closesAt, problem } = await this.window(order, now)
    const nothingLeft = items.every((i) => i.returnable === 0)
    return {
      canReturn: !problem && !nothingLeft,
      reason:
        problem ?? (nothingLeft ? 'Everything in this order has already been returned.' : null),
      windowClosesAt: closesAt,
      items,
    }
  }

  /** POST /returns — the customer asks to return some (or all) items. */
  async request(userId: string, dto: RequestReturnDto, now = new Date()): Promise<MyReturn> {
    const order = await this.myOrder(userId, dto.orderNumber)
    const { problem } = await this.window(order, now)
    if (problem) throw new ConflictException({ message: problem, code: 'RETURN_NOT_POSSIBLE' })

    const created = await this.prisma.$transaction(async (tx) => {
      // Lock the order: two requests at once can't both claim the last shirt.
      await tx.$queryRaw`SELECT id FROM orders WHERE id = ${order.id}::uuid FOR UPDATE`
      const returned = await this.alreadyReturned(tx, order.id)
      const seen = new Set<string>()
      for (const line of dto.items) {
        const item = order.items.find((i) => i.id === line.orderItemId)
        if (!item || seen.has(item.id))
          throw new NotFoundException('That item is not in this order.')
        seen.add(item.id)
        const left = item.quantity - (returned.get(item.id) ?? 0)
        if (line.quantity > left)
          throw new ConflictException({
            message:
              left === 0
                ? `${item.productName} (${item.variantLabel}) has already been returned.`
                : `You can return at most ${left} × ${item.productName} (${item.variantLabel}).`,
            code: 'RETURN_QUANTITY',
          })
      }
      return tx.returnRequest.create({
        data: {
          orderId: order.id,
          userId,
          reason: dto.reason,
          customerNote: dto.note ?? null,
          items: {
            create: dto.items.map((l) => ({ orderItemId: l.orderItemId, quantity: l.quantity })),
          },
        },
        include,
      })
    })
    return toMine(created)
  }

  /** GET /returns/my — newest first. */
  async mine(userId: string): Promise<MyReturn[]> {
    const rows = await this.prisma.returnRequest.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include,
    })
    return rows.map(toMine)
  }

  // ---- Admin ---------------------------------------------------------------

  /** Waiting requests first (oldest first, so nothing is forgotten). */
  async adminList(status: ReturnStatus | undefined, page: number): Promise<Paginated<AdminReturn>> {
    const where = status ? { status } : {}
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.returnRequest.count({ where }),
      this.prisma.returnRequest.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        skip: (page - 1) * ADMIN_PAGE_SIZE,
        take: ADMIN_PAGE_SIZE,
        select: { id: true },
      }),
    ])
    return {
      items: await Promise.all(rows.map((r) => this.adminView(r.id))),
      total,
      page,
      pageSize: ADMIN_PAGE_SIZE,
      totalPages: Math.ceil(total / ADMIN_PAGE_SIZE),
    }
  }

  async adminView(id: string): Promise<AdminReturn> {
    const r = await this.prisma.returnRequest.findUnique({
      where: { id },
      include: {
        ...include,
        order: { include: { payments: { include: { refunds: true } } } },
        user: { select: { id: true, fullName: true, email: true } },
        refunds: { orderBy: { createdAt: 'asc' } },
      },
    })
    if (!r) throw new NotFoundException('Return request not found')
    const paid = r.order.payments.find(
      (p) => p.status === 'PAID' || p.status === 'PARTIALLY_REFUNDED',
    )
    const maxRefundable = paid
      ? paid.amount.minus(reservedRefunds(paid.refunds))
      : new Prisma.Decimal(0)
    const suggested = suggestedRefund(r.order, r.items)
    return {
      ...toMine({ ...r, order: { orderNumber: r.order.orderNumber } }),
      orderId: r.orderId,
      customer: { id: r.user.id, name: r.user.fullName, email: r.user.email, phone: r.order.phone },
      paymentMethod: r.order.paymentMethod,
      suggestedRefund: Prisma.Decimal.min(suggested, maxRefundable),
      maxRefundable,
      refunds: r.refunds.map((f) => ({
        id: f.id,
        amount: f.amount,
        status: f.status,
        gatewayRefId: f.gatewayRefId,
        createdAt: f.createdAt,
      })),
    }
  }

  approve(id: string, note: string): Promise<AdminReturn> {
    return this.step(id, ReturnStatus.REQUESTED, {
      status: ReturnStatus.APPROVED,
      approvedAt: new Date(),
      adminNote: note,
    })
  }

  reject(id: string, reason: string): Promise<AdminReturn> {
    return this.step(id, ReturnStatus.REQUESTED, {
      status: ReturnStatus.REJECTED,
      rejectedAt: new Date(),
      rejectionReason: reason,
    })
  }

  /**
   * The parcel arrived. Items marked "restock" go back on sale NOW (decision
   * #4 — never at approval: nothing is back until it's physically back).
   */
  async receive(id: string, dto: ReceiveReturnDto): Promise<AdminReturn> {
    const changes: StockChange[] = []
    await this.prisma.$transaction(async (tx) => {
      const r = await this.lockAt(tx, id, ReturnStatus.APPROVED)
      for (const decision of dto.items) {
        if (!r.items.some((i) => i.orderItemId === decision.orderItemId))
          throw new NotFoundException('That item is not in this return.')
      }
      // Every item gets a decision; unmentioned items default to "restock".
      const restock = new Map(dto.items.map((d) => [d.orderItemId, d.restock]))
      for (const item of r.items) {
        await tx.returnItem.update({
          where: { id: item.id },
          data: { restock: restock.get(item.orderItemId) ?? true },
        })
      }
      const sellable = r.items.filter((i) => restock.get(i.orderItemId) ?? true)
      for (const item of stockLockOrder(
        sellable.map((i) => ({ ...i, variantId: i.orderItem.variantId })),
      )) {
        if (!item.variantId) continue // the variant was deleted — nothing to put back on sale
        try {
          changes.push(
            await this.stock.adjust(tx, {
              variantId: item.variantId,
              adjustment: { change: item.quantity },
              reason: InventoryChangeReason.RETURN_RESTOCKED,
              orderId: r.orderId,
              note: `Return ${id}`,
            }),
          )
        } catch (error) {
          if (!(error instanceof NotFoundException)) throw error
          this.logger.warn(`Return ${id}: variant ${item.variantId} is archived — not restocked`)
        }
      }
      await tx.returnRequest.update({ where: { id }, data: { status: ReturnStatus.RECEIVED } })
    })
    await this.stock.notifyLowStock(changes)
    return this.adminView(id)
  }

  // ---- helpers -------------------------------------------------------------

  /** Moves a request from `from` to the next status — only if it's still at `from`. */
  private async step(id: string, from: ReturnStatus, data: Prisma.ReturnRequestUpdateInput) {
    await this.prisma.$transaction(async (tx) => {
      await this.lockAt(tx, id, from)
      await tx.returnRequest.update({ where: { id }, data })
    })
    return this.adminView(id)
  }

  /** Locks the request and checks it's at the expected step. */
  async lockAt(tx: Prisma.TransactionClient, id: string, expected: ReturnStatus) {
    await tx.$queryRaw`SELECT id FROM return_requests WHERE id = ${id}::uuid FOR UPDATE`
    const r = await tx.returnRequest.findUnique({ where: { id }, include })
    if (!r) throw new NotFoundException('Return request not found')
    if (r.status !== expected)
      throw new ConflictException({
        message: `This return is ${r.status.toLowerCase()} — it can't be ${STEP_VERB[expected]} now.`,
        code: 'RETURN_WRONG_STEP',
      })
    return r
  }

  private async myOrder(userId: string, number: string) {
    const orderNumber = parseOrderNumber(number)
    const order =
      orderNumber === null
        ? null
        : await this.prisma.order.findFirst({
            where: { orderNumber, userId },
            include: { items: true },
          })
    if (!order) throw new NotFoundException('Order not found') // someone else's looks missing too
    return order
  }

  /** Delivered, and within return_window_days of delivery? */
  private async window(order: { status: OrderStatus; deliveredAt: Date | null }, now: Date) {
    if (order.status !== OrderStatus.DELIVERED || !order.deliveredAt)
      return { closesAt: null, problem: 'Returns are possible once your order has been delivered.' }
    const days = await this.settings.returnWindowDays()
    const closesAt = new Date(order.deliveredAt.getTime() + days * 86_400_000)
    if (days === 0) return { closesAt: null, problem: 'Returns are not available at the moment.' }
    if (now > closesAt)
      return {
        closesAt,
        problem: `The return window for this order closed on ${closesAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Dhaka' })}.`,
      }
    return { closesAt, problem: null }
  }

  /** Quantity per order item already returned or asked for — rejected requests don't count. */
  private async alreadyReturned(db: Prisma.TransactionClient | PrismaService, orderId: string) {
    const rows = await db.returnItem.groupBy({
      by: ['orderItemId'],
      where: { returnRequest: { orderId, status: { not: ReturnStatus.REJECTED } } },
      _sum: { quantity: true },
    })
    return new Map(rows.map((r) => [r.orderItemId, r._sum.quantity ?? 0]))
  }
}

const STEP_VERB: Record<ReturnStatus, string> = {
  REQUESTED: 'approved or rejected',
  APPROVED: 'marked received',
  RECEIVED: 'refunded',
  REJECTED: 'changed',
  REFUNDED: 'changed',
}

/** Refunds that count against what was paid: done, or still in progress. */
export function reservedRefunds(
  refunds: { amount: Prisma.Decimal; status: string }[],
): Prisma.Decimal {
  return refunds
    .filter((f) => f.status === 'PROCESSED' || f.status === 'PENDING')
    .reduce((sum, f) => sum.plus(f.amount), new Prisma.Decimal(0))
}

/**
 * Decision #5: the returned items' share of what was ACTUALLY paid —
 * their prices, minus their share of the discount, plus their share of VAT.
 * Delivery isn't part of it (the admin may add it by changing the amount).
 */
export function suggestedRefund(
  order: { subtotal: Prisma.Decimal; discountAmount: Prisma.Decimal; vatAmount: Prisma.Decimal },
  items: { quantity: number; orderItem: { unitPrice: Prisma.Decimal } }[],
): Prisma.Decimal {
  const lines = items.reduce(
    (sum, i) => sum.plus(i.orderItem.unitPrice.times(i.quantity)),
    new Prisma.Decimal(0),
  )
  if (order.subtotal.isZero()) return new Prisma.Decimal(0)
  const share = lines.dividedBy(order.subtotal)
  return lines
    .minus(order.discountAmount.times(share))
    .plus(order.vatAmount.times(share))
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
}

function toMine(r: FullReturn): MyReturn {
  return {
    id: r.id,
    orderNumber: displayNumber(r.order.orderNumber),
    status: r.status,
    reason: r.reason as ReturnReason,
    customerNote: r.customerNote,
    adminNote: r.adminNote,
    rejectionReason: r.rejectionReason,
    refundAmount: r.refundAmount,
    items: r.items.map((i) => ({
      orderItemId: i.orderItemId,
      productName: i.orderItem.productName,
      variantLabel: i.orderItem.variantLabel,
      imageUrl: i.orderItem.imageUrl,
      quantity: i.quantity,
      restock: i.restock,
    })),
    createdAt: r.createdAt,
    approvedAt: r.approvedAt,
    rejectedAt: r.rejectedAt,
  }
}
