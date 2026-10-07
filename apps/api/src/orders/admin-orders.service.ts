import { ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { Prisma } from '@nowoll/database'
import { OrderStatus, PaymentMethod, PaymentStatus } from '@nowoll/database/enums'
import type { AdminOrderDetail, AdminOrderList } from '@nowoll/types'
import { addDays, startOfStoreDay } from '../analytics/store-time.js'
import { CUSTOMER_NOTIFIER, type CustomerNotifier } from '../notifications/customer-notifier.js'
import { PrismaService } from '../prisma/prisma.service.js'
import type {
  AdminOrdersQuery,
  OrderNotesDto,
  OrderStatusChangeDto,
  OrderTrackingDto,
} from './dto/admin-orders.dto.js'
import { parseOrderNumber } from './order-lookup.service.js'
import { displayNumber } from './order-number.js'
import { OrdersService } from './orders.service.js'

// ============================================================================
// Running orders from the admin panel (step 31). Phase 1 delivery is manual:
// staff book the courier in its own app, then type the courier + tracking
// number here (docs/integrations/courier.md).
//
// STATE MACHINE — the only status changes staff can make:
//
//   PENDING ──(COD, after the confirmation call)──▶ CONFIRMED ──▶ PROCESSING ──▶ SHIPPED ──▶ DELIVERED
//      │                                               │  └────────────────────────▲
//      └──────────────── CANCELLED ◀───────────────────┴── (not after shipping)
//
// Online orders become CONFIRMED when SSLCommerz confirms the payment (never by
// hand). RETURNED belongs to the returns module.
//
// Two staff members at once: every change says which status the person SAW
// (`from`). The order row is locked and compared — if it changed meanwhile,
// the change is refused instead of overwriting the other person's work.
// ============================================================================

const NEXT: Record<OrderStatus, OrderStatus[]> = {
  PENDING: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
  // CONFIRMED → SHIPPED directly: a small shop often packs and ships the same day.
  CONFIRMED: [OrderStatus.PROCESSING, OrderStatus.SHIPPED, OrderStatus.CANCELLED],
  PROCESSING: [OrderStatus.SHIPPED, OrderStatus.CANCELLED],
  SHIPPED: [OrderStatus.DELIVERED],
  DELIVERED: [],
  CANCELLED: [],
  RETURNED: [],
}

/** The changes allowed from here — the API's rules, shown to the admin page as-is. */
export function allowedNext(order: {
  status: OrderStatus
  paymentMethod: PaymentMethod
}): OrderStatus[] {
  return NEXT[order.status].filter(
    // An unpaid ONLINE order is confirmed by its payment, not by staff.
    (to) =>
      !(
        order.status === OrderStatus.PENDING &&
        to === OrderStatus.CONFIRMED &&
        order.paymentMethod !== PaymentMethod.COD
      ),
  )
}

const canMarkCashCollected = (o: {
  paymentMethod: PaymentMethod
  paymentStatus: PaymentStatus
  status: OrderStatus
}) =>
  o.paymentMethod === PaymentMethod.COD &&
  o.paymentStatus === PaymentStatus.PENDING &&
  (o.status === OrderStatus.SHIPPED || o.status === OrderStatus.DELIVERED)

const changedMeanwhile = (number: number, now: OrderStatus) =>
  new ConflictException({
    message: `Order ${displayNumber(number)} was just changed by someone else (it is now ${now.toLowerCase()}). Reload and check it.`,
    code: 'ORDER_CHANGED',
  })

const DETAIL_INCLUDE = {
  items: { orderBy: { createdAt: 'asc' } },
  payments: { orderBy: { createdAt: 'asc' } },
  statusHistory: {
    orderBy: { createdAt: 'asc' },
    include: { changedBy: { select: { fullName: true, email: true } } },
  },
} satisfies Prisma.OrderInclude

@Injectable()
export class AdminOrdersService {
  private readonly logger = new Logger(AdminOrdersService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
    @Inject(CUSTOMER_NOTIFIER) private readonly notifier: CustomerNotifier,
  ) {}

  /** GET /orders — newest first. */
  async list(query: AdminOrdersQuery): Promise<AdminOrderList> {
    const { page, pageSize } = query
    const where: Prisma.OrderWhereInput = {
      ...(query.status && { status: query.status }),
      ...(query.paymentMethod && { paymentMethod: query.paymentMethod }),
      ...(query.paymentStatus && { paymentStatus: query.paymentStatus }),
      ...((query.from || query.to) && {
        createdAt: {
          // Whole shop days, Bangladesh time: "to 7 Oct" includes all of 7 Oct.
          ...(query.from && { gte: startOfStoreDay(query.from) }),
          ...(query.to && { lt: startOfStoreDay(addDays(query.to, 1)) }),
        },
      }),
      ...(query.q && { OR: searchFor(query.q) }),
    }
    const [total, rows] = await Promise.all([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        include: { _count: { select: { items: true } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ])
    return {
      items: rows.map((o) => ({
        id: o.id,
        number: displayNumber(o.orderNumber),
        status: o.status,
        paymentMethod: o.paymentMethod,
        paymentStatus: o.paymentStatus,
        customerName: o.customerName,
        phone: o.phone,
        email: o.email,
        district: o.shippingDistrict,
        itemCount: o._count.items,
        total: o.total.toString(),
        createdAt: o.createdAt.toISOString(),
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    }
  }

  /** GET /orders/:id */
  async detail(id: string): Promise<AdminOrderDetail> {
    const o = await this.prisma.order.findUnique({ where: { id }, include: DETAIL_INCLUDE })
    if (!o) throw new NotFoundException('Order not found')
    const money = (d: Prisma.Decimal) => d.toString()
    return {
      id: o.id,
      number: displayNumber(o.orderNumber),
      status: o.status,
      paymentMethod: o.paymentMethod,
      paymentStatus: o.paymentStatus,
      customer: { name: o.customerName, email: o.email, phone: o.phone, hasAccount: !!o.userId },
      address: {
        line1: o.shippingAddressLine1,
        line2: o.shippingAddressLine2,
        area: o.shippingArea,
        district: o.shippingDistrict,
        division: o.shippingDivision,
        postalCode: o.shippingPostalCode,
        zoneName: o.shippingZoneName,
      },
      items: o.items.map((i) => ({
        id: i.id,
        productId: i.productId,
        productName: i.productName,
        variantLabel: i.variantLabel,
        sku: i.sku,
        imageUrl: i.imageUrl,
        unitPrice: money(i.unitPrice),
        quantity: i.quantity,
        lineTotal: money(i.lineTotal),
      })),
      totals: {
        subtotal: money(o.subtotal),
        discountAmount: money(o.discountAmount),
        discountCode: o.discountCode,
        shippingFee: money(o.shippingFee),
        vatRate: money(o.vatRate),
        vatAmount: money(o.vatAmount),
        total: money(o.total),
      },
      payments: o.payments.map((p) => ({
        id: p.id,
        method: p.method,
        status: p.status,
        amount: money(p.amount),
        transactionId: p.transactionId,
        bankTransactionId: p.bankTransactionId,
        paidAt: p.paidAt?.toISOString() ?? null,
        createdAt: p.createdAt.toISOString(),
      })),
      courierName: o.courierName,
      trackingNumber: o.trackingNumber,
      customerNote: o.customerNote,
      adminNotes: o.adminNotes,
      cancelReason: o.cancelReason,
      timeline: o.statusHistory.map((h) => ({
        from: h.fromStatus,
        to: h.toStatus,
        note: h.note,
        by: h.changedBy ? (h.changedBy.fullName ?? h.changedBy.email) : null,
        at: h.createdAt.toISOString(),
      })),
      allowedNext: allowedNext(o),
      canMarkCashCollected: canMarkCashCollected(o),
      createdAt: o.createdAt.toISOString(),
      updatedAt: o.updatedAt.toISOString(),
    }
  }

  /** PATCH /orders/:id/status */
  async changeStatus(
    id: string,
    dto: OrderStatusChangeDto,
    actorId: string | null,
  ): Promise<AdminOrderDetail> {
    if (dto.to === OrderStatus.CANCELLED) {
      // The existing cancel: stock back (logged), discount use returned,
      // pending payments cancelled — all in one transaction.
      const current = await this.prisma.order.findUnique({ where: { id } })
      if (!current) throw new NotFoundException('Order not found')
      if (current.status !== dto.from) throw changedMeanwhile(current.orderNumber, current.status)
      await this.orders.cancel(id, { reason: dto.note!, actorId })
      return this.detail(id)
    }

    const now = new Date()
    await this.prisma.$transaction(async (tx) => {
      // Lock the row: a second change (or a payment confirmation) waits for us.
      const locked = await tx.$queryRaw<
        { id: string }[]
      >`SELECT id FROM orders WHERE id = ${id}::uuid FOR UPDATE`
      if (locked.length === 0) throw new NotFoundException('Order not found')
      const order = await tx.order.findUniqueOrThrow({ where: { id } })
      if (order.status !== dto.from) throw changedMeanwhile(order.orderNumber, order.status)
      if (!allowedNext(order).includes(dto.to))
        throw new ConflictException({
          message: `An order that is ${order.status.toLowerCase()} can't be marked ${dto.to.toLowerCase()}.`,
          code: 'STATUS_CHANGE_NOT_ALLOWED',
        })

      const cashNow =
        dto.to === OrderStatus.DELIVERED &&
        dto.cashCollected === true &&
        canMarkCashCollected({ ...order, status: OrderStatus.DELIVERED })
      await tx.order.update({
        where: { id },
        data: {
          status: dto.to,
          ...(dto.to === OrderStatus.CONFIRMED && { confirmedAt: now }),
          ...(dto.to === OrderStatus.SHIPPED && {
            shippedAt: now,
            courierName: dto.courierName!,
            trackingNumber: dto.trackingNumber!,
          }),
          ...(dto.to === OrderStatus.DELIVERED && { deliveredAt: now }),
          ...(cashNow && { paymentStatus: PaymentStatus.PAID }),
          statusHistory: {
            create: {
              fromStatus: order.status,
              toStatus: dto.to,
              note: noteFor(dto, cashNow),
              changedById: actorId,
            },
          },
        },
      })
      if (cashNow) await markPaymentsPaid(tx, id, now)
    })

    // AFTER the commit: the customer is told only about what really happened.
    if (dto.to === OrderStatus.SHIPPED) await this.tell(() => this.notifier.orderShipped(id))
    if (dto.to === OrderStatus.DELIVERED) await this.tell(() => this.notifier.orderDelivered(id))
    return this.detail(id)
  }

  /** PATCH /orders/:id/tracking — correct a typo after shipping (no new email). */
  async updateTracking(id: string, dto: OrderTrackingDto): Promise<AdminOrderDetail> {
    const order = await this.prisma.order.findUnique({ where: { id } })
    if (!order) throw new NotFoundException('Order not found')
    if (order.status !== OrderStatus.SHIPPED && order.status !== OrderStatus.DELIVERED)
      throw new ConflictException({
        message: 'The tracking number is entered when the order is marked shipped.',
        code: 'NOT_SHIPPED',
      })
    await this.prisma.order.update({
      where: { id },
      data: { courierName: dto.courierName, trackingNumber: dto.trackingNumber },
    })
    return this.detail(id)
  }

  /** PATCH /orders/:id/notes — staff-only notes. */
  async updateNotes(id: string, dto: OrderNotesDto): Promise<AdminOrderDetail> {
    const updated = await this.prisma.order.updateMany({
      where: { id },
      data: { adminNotes: dto.adminNotes },
    })
    if (updated.count === 0) throw new NotFoundException('Order not found')
    return this.detail(id)
  }

  /** PATCH /orders/:id/cash-collected — the courier handed over the COD cash. */
  async markCashCollected(id: string, actorId: string | null): Promise<AdminOrderDetail> {
    const now = new Date()
    await this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<
        { id: string }[]
      >`SELECT id FROM orders WHERE id = ${id}::uuid FOR UPDATE`
      if (locked.length === 0) throw new NotFoundException('Order not found')
      const order = await tx.order.findUniqueOrThrow({ where: { id } })
      if (!canMarkCashCollected(order))
        throw new ConflictException({
          message:
            order.paymentStatus === PaymentStatus.PAID
              ? 'This order is already marked paid.'
              : 'Cash can be marked collected for a cash-on-delivery order once it has shipped.',
          code: 'CASH_NOT_COLLECTABLE',
        })
      await tx.order.update({
        where: { id },
        data: {
          paymentStatus: PaymentStatus.PAID,
          statusHistory: {
            create: {
              fromStatus: order.status,
              toStatus: order.status,
              note: 'Cash collected',
              changedById: actorId,
            },
          },
        },
      })
      await markPaymentsPaid(tx, id, now)
    })
    return this.detail(id)
  }

  /** Telling the customer never undoes a saved change — a queue hiccup is only logged. */
  private async tell(send: () => Promise<void>): Promise<void> {
    await send().catch((e: unknown) =>
      this.logger.error(`Customer notification failed: ${String(e)}`),
    )
  }
}

async function markPaymentsPaid(tx: Prisma.TransactionClient, orderId: string, at: Date) {
  await tx.payment.updateMany({
    where: { orderId, method: PaymentMethod.COD, status: PaymentStatus.PENDING },
    data: { status: PaymentStatus.PAID, paidAt: at },
  })
}

function noteFor(dto: OrderStatusChangeDto, cashCollected: boolean): string | null {
  const parts = [
    dto.note?.trim() || null,
    dto.to === OrderStatus.SHIPPED ? `${dto.courierName} · ${dto.trackingNumber}` : null,
    cashCollected ? 'Cash collected' : null,
  ].filter(Boolean)
  return parts.length > 0 ? parts.join(' — ') : null
}

/** "NW-10001" / "10001" → that order; otherwise name, email or phone (any part). */
function searchFor(q: string): Prisma.OrderWhereInput[] {
  const or: Prisma.OrderWhereInput[] = [
    { customerName: { contains: q, mode: 'insensitive' } },
    { email: { contains: q, mode: 'insensitive' } },
  ]
  const number = parseOrderNumber(q)
  if (number !== null) or.push({ orderNumber: number })
  // Phones are stored as +8801712345678; people type 01712345678 or 1712-345678.
  const digits = q.replace(/\D/g, '').replace(/^(880|0)/, '')
  if (digits.length >= 4) or.push({ phone: { contains: digits } })
  return or
}
