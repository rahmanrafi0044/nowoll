import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common'
import { Prisma } from '@nowoll/database'
import {
  InventoryChangeReason,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
} from '@nowoll/database/enums'
import { isDistrictInDivision } from '@nowoll/validation'
import { CheckoutService } from '../checkout/checkout.service.js'
import { DiscountsService } from '../discounts/discounts.service.js'
import { type StockChange, StockService } from '../inventory/stock.service.js'
import { PaymentsService } from '../payments/payments.service.js'
import { newTransactionId } from '../payments/transaction-id.js'
import { PrismaService } from '../prisma/prisma.service.js'
import type { CreateOrderDto } from './dto/create-order.dto.js'
import { displayNumber } from './order-number.js'
import { ORDER_NOTIFIER, type OrderNotifier } from './order-notifier.js'

export interface PlacedOrder {
  orderId: string
  orderNumber: number
  displayNumber: string // "NW-10001" — what the customer sees
  status: OrderStatus
  paymentMethod: PaymentMethod
  paymentStatus: PaymentStatus
  total: Prisma.Decimal
  /** What the storefront does next: nothing (COD), or send the customer to pay (step 20). */
  nextAction: 'NONE' | 'PAY'
}

export { displayNumber }

/**
 * DEADLOCK PREVENTION: every transaction that changes several variants' stock
 * locks them in the SAME order (sorted by variant id). Without this, an order
 * for {A, B} and another for {B, A} could each lock one variant and wait
 * forever for the other — Postgres would then abort one of them (a "deadlock").
 * Used by both create() and cancel(). See orders.service.spec.ts for proof.
 */
export function stockLockOrder<T extends { variantId: string | null }>(lines: T[]): T[] {
  return [...lines].sort((a, b) => (a.variantId ?? '').localeCompare(b.variantId ?? ''))
}

const CANCELLABLE: OrderStatus[] = [
  OrderStatus.PENDING,
  OrderStatus.CONFIRMED,
  OrderStatus.PROCESSING,
]

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly checkout: CheckoutService,
    private readonly discounts: DiscountsService,
    private readonly stock: StockService,
    private readonly payments: PaymentsService,
    @Inject(ORDER_NOTIFIER) private readonly notifier: OrderNotifier,
  ) {}

  /**
   * POST /orders — places an order. CLAUDE.md §9: stock, the order and the
   * payment record are saved in ONE transaction; if anything fails (an item
   * sold out a second ago, the discount ran out), NOTHING is saved.
   */
  async create(
    dto: CreateOrderDto,
    idempotencyKey: string,
    userId: string | null = null, // the signed-in customer (step 22); null = guest checkout
  ): Promise<PlacedOrder> {
    // Same request seen before (double tap / network retry) → the same order back (decision #4).
    const existing = await this.findByIdempotencyKey(idempotencyKey)
    if (existing) return existing

    if (!isDistrictInDivision(dto.address.district, dto.address.division)) {
      throw new BadRequestException(
        `${dto.address.district} is not in ${dto.address.division} division.`,
      )
    }

    const stockChanges: StockChange[] = []
    let placed: PlacedOrder
    try {
      placed = await this.prisma.$transaction(
        async (tx) => {
          // 1. Price everything again — the SAME calculation the review step showed (step 17).
          const quote = await this.checkout.quote(
            {
              items: dto.items,
              district: dto.address.district,
              discountCode: dto.discountCode,
              email: dto.contact.email,
            },
            tx,
          )
          if (quote.discountProblem) {
            throw new UnprocessableEntityException({
              message: quote.discountProblem.message,
              code: quote.discountProblem.code,
            })
          }
          const { totals, shipping } = quote
          if (!shipping) throw new BadRequestException('A delivery district is required.')

          // 2. Decision #5: never charge a different amount than the customer reviewed.
          if (!totals.total.equals(new Prisma.Decimal(dto.expectedTotal))) {
            throw new ConflictException({
              message: `Prices changed since you reviewed your order — the total is now ৳${totals.total.toString()}. Please review and try again.`,
              code: 'PRICE_CHANGED',
            })
          }

          // 2b. "Pay online" must actually be possible for this total (step 20) —
          //     otherwise the order would hold stock for a payment that can't happen.
          if (dto.paymentMethod === PaymentMethod.SSLCOMMERZ) {
            const problem = this.payments.onlinePaymentProblem(totals.total.toString())
            if (problem) throw new UnprocessableEntityException(problem)
          }

          // 3. The order, with COPIES of names, prices and address (they stay correct forever).
          const order = await tx.order.create({
            data: {
              idempotencyKey,
              userId,
              status: OrderStatus.PENDING, // COD: awaiting confirmation call (decision #3); online: awaiting payment
              paymentMethod: dto.paymentMethod,
              paymentStatus: PaymentStatus.PENDING,
              email: dto.contact.email,
              phone: dto.contact.phone,
              customerName: dto.contact.fullName,
              shippingAddressLine1: dto.address.addressLine1,
              shippingAddressLine2: dto.address.addressLine2 ?? null,
              shippingArea: dto.address.area ?? null,
              shippingDistrict: dto.address.district,
              shippingDivision: dto.address.division,
              shippingPostalCode: dto.address.postalCode ?? null,
              shippingZoneId: shipping.id,
              shippingZoneName: shipping.name,
              subtotal: totals.subtotal,
              discountAmount: totals.discount,
              shippingFee: totals.shippingFee,
              vatRate: totals.vatRate,
              vatAmount: totals.vatAmount,
              total: totals.total,
              customerNote: dto.customerNote ?? null,
              items: {
                create: quote.lines.map((l) => ({
                  productId: l.productId,
                  variantId: l.variantId,
                  productName: l.productName,
                  variantLabel: l.variantLabel,
                  sku: l.sku,
                  imageUrl: l.imageUrl,
                  unitPrice: l.unitPrice,
                  quantity: l.quantity,
                  lineTotal: l.lineTotal,
                })),
              },
              statusHistory: { create: { toStatus: OrderStatus.PENDING, note: 'Order placed' } },
            },
          })

          // 4. Use the discount code for real (counts the use; step 15).
          if (quote.discount) {
            const redeemed = await this.discounts.redeem(tx, {
              code: quote.discount.code,
              orderId: order.id,
              email: dto.contact.email,
              subtotal: totals.subtotal,
            })
            await tx.order.update({
              where: { id: order.id },
              data: { discountCodeId: redeemed.discountCodeId, discountCode: redeemed.code },
            })
          }

          // 5. Take the stock — in the fixed lock order (see stockLockOrder).
          for (const line of stockLockOrder(quote.lines)) {
            try {
              stockChanges.push(
                await this.stock.adjust(tx, {
                  variantId: line.variantId,
                  adjustment: { change: -line.quantity },
                  reason: InventoryChangeReason.ORDER_PLACED,
                  orderId: order.id,
                }),
              )
            } catch (error) {
              if (error instanceof ConflictException || error instanceof NotFoundException) {
                throw new ConflictException({
                  message: `Sorry — ${line.productName} (${line.variantLabel}) just sold out. Please review your bag.`,
                  code: 'OUT_OF_STOCK',
                })
              }
              throw error
            }
          }

          // 6. The first payment attempt. Its short transaction id is what
          //    SSLCommerz receives as tran_id (≤ 30 characters — step 19).
          await tx.payment.create({
            data: {
              orderId: order.id,
              method: dto.paymentMethod,
              status: PaymentStatus.PENDING,
              amount: totals.total,
              transactionId: newTransactionId(order.orderNumber),
            },
          })

          return toPlaced(order)
        },
        { timeout: 15_000, maxWait: 5_000 },
      )
    } catch (error) {
      // Two identical requests at the SAME moment: the database's unique index
      // lets only one through; the other gets the order that won.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const winner = await this.findByIdempotencyKey(idempotencyKey)
        if (winner) return winner
      }
      throw error
    }

    // After commit only: alerts and notifications for things that really happened.
    await this.stock.notifyLowStock(stockChanges)
    await this.notifier
      .orderPlaced({
        orderId: placed.orderId,
        orderNumber: placed.orderNumber,
        email: dto.contact.email,
        paymentMethod: placed.paymentMethod,
        total: placed.total.toString(),
      })
      .catch((e: unknown) => this.logger.error(`Order-placed notification failed: ${String(e)}`))
    return placed
  }

  /**
   * Cancels an order and undoes its effects, in one transaction: stock goes
   * back (logged ORDER_CANCELLED), the discount use is returned (step 15
   * decision #3), pending payments are cancelled, and the reason is recorded.
   * Used by the unpaid-order sweep now, payment failures (step 20) and admins (Phase 5).
   *
   * `onlyIfUnpaid`: the sweep's safety catch — if a payment was confirmed a
   * moment ago, the order is left alone.
   */
  async cancel(
    orderId: string,
    opts: {
      reason: string
      actorId?: string | null
      onlyIfUnpaid?: boolean
      paymentStatus?: PaymentStatus
    },
  ): Promise<{ cancelled: boolean }> {
    const changes: StockChange[] = []
    const result = await this.prisma.$transaction(async (tx) => {
      // Lock the order row: a payment confirmation for the same order must wait for us (or we for it).
      const locked = await tx.$queryRaw<
        { id: string }[]
      >`SELECT id FROM orders WHERE id = ${orderId}::uuid FOR UPDATE`
      if (locked.length === 0) throw new NotFoundException('Order not found')
      const order = await tx.order.findUniqueOrThrow({
        where: { id: orderId },
        include: { items: true },
      })

      if (order.status === OrderStatus.CANCELLED) return { cancelled: false } // already done — safe to repeat
      if (
        opts.onlyIfUnpaid &&
        (order.status !== OrderStatus.PENDING || order.paymentStatus !== PaymentStatus.PENDING)
      ) {
        return { cancelled: false }
      }
      if (!CANCELLABLE.includes(order.status)) {
        throw new ConflictException(
          `Order ${displayNumber(order.orderNumber)} is ${order.status.toLowerCase()} and can't be cancelled.`,
        )
      }

      for (const item of stockLockOrder(order.items)) {
        if (!item.variantId) continue
        try {
          changes.push(
            await this.stock.adjust(tx, {
              variantId: item.variantId,
              adjustment: { change: item.quantity },
              reason: InventoryChangeReason.ORDER_CANCELLED,
              orderId,
              note: opts.reason,
              actorId: opts.actorId ?? null,
            }),
          )
        } catch (error) {
          // The variant was archived since: nothing to put back on sale.
          if (!(error instanceof NotFoundException)) throw error
          this.logger.warn(
            `Order ${displayNumber(order.orderNumber)}: variant ${item.variantId} is archived — stock not restored`,
          )
        }
      }

      await this.discounts.release(tx, orderId)
      await tx.payment.updateMany({
        where: { orderId, status: PaymentStatus.PENDING },
        data: { status: opts.paymentStatus ?? PaymentStatus.CANCELLED },
      })
      await tx.order.update({
        where: { id: orderId },
        data: {
          status: OrderStatus.CANCELLED,
          paymentStatus:
            order.paymentStatus === PaymentStatus.PENDING
              ? (opts.paymentStatus ?? PaymentStatus.CANCELLED)
              : order.paymentStatus,
          cancelledAt: new Date(),
          cancelReason: opts.reason,
          statusHistory: {
            create: {
              fromStatus: order.status,
              toStatus: OrderStatus.CANCELLED,
              note: opts.reason,
              changedById: opts.actorId ?? null,
            },
          },
        },
      })
      return { cancelled: true }
    })
    await this.stock.notifyLowStock(changes) // (restocking never alerts; kept for symmetry)
    return result
  }

  private async findByIdempotencyKey(idempotencyKey: string): Promise<PlacedOrder | null> {
    const order = await this.prisma.order.findUnique({ where: { idempotencyKey } })
    return order ? toPlaced(order) : null
  }
}

function toPlaced(order: {
  id: string
  orderNumber: number
  status: OrderStatus
  paymentMethod: PaymentMethod
  paymentStatus: PaymentStatus
  total: Prisma.Decimal
}): PlacedOrder {
  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    displayNumber: displayNumber(order.orderNumber),
    status: order.status,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    total: order.total,
    nextAction:
      order.paymentMethod === PaymentMethod.SSLCOMMERZ &&
      order.paymentStatus === PaymentStatus.PENDING
        ? 'PAY'
        : 'NONE',
  }
}
