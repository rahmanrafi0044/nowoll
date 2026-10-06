import {
  BadGatewayException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common'
import { Interval } from '@nestjs/schedule'
import { randomBytes } from 'node:crypto'
import { Prisma } from '@nowoll/database'
import {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  RefundStatus,
  ReturnStatus,
} from '@nowoll/database/enums'
import type { PaymentProvider } from '@nowoll/payments'
import { CUSTOMER_NOTIFIER, type CustomerNotifier } from '../notifications/customer-notifier.js'
import { displayNumber } from '../orders/order-number.js'
import { PAYMENT_GATEWAY } from '../payments/payment-gateway.js'
import { PrismaService } from '../prisma/prisma.service.js'
import type { RefundReturnDto, ResolveRefundDto } from './dto/return.dto.js'
import { type AdminReturn, ReturnsService, reservedRefunds } from './returns.service.js'

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000

/** Our id for one refund at SSLCommerz (refund_trans_id, ≤ 30 characters, unique). */
export const newRefundTransactionId = (orderNumber: number) =>
  `RF${orderNumber}-${randomBytes(3).toString('hex').toUpperCase()}`

// ============================================================================
// Refunds for returns (step 25 decisions #5–#6). Money rules:
//
//  1. NEVER more than was paid minus what's already refunded — counting
//     refunds still in progress. Checked inside a transaction that LOCKS the
//     payment row, so two refunds at the same moment take turns.
//  2. The refund is RECORDED (as PENDING) before SSLCommerz is called, and
//     the call happens outside any database transaction.
//  3. SSLCommerz didn't answer? We can't know if the money went — so it stays
//     PENDING ("unknown"), blocks another attempt, and an admin resolves it
//     after checking the SSLCommerz panel. Marking it FAILED and trying again
//     with a NEW refund id could pay the customer twice.
//  4. "processing" → PENDING with SSLCommerz's refund_ref_id; reconcile()
//     asks again every 15 minutes.
// ============================================================================
@Injectable()
export class RefundsService {
  private readonly logger = new Logger(RefundsService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly returns: ReturnsService,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentProvider,
    @Inject(CUSTOMER_NOTIFIER) private readonly notifier: CustomerNotifier,
  ) {}

  /** PATCH /returns/:id/refund */
  async refund(returnId: string, dto: RefundReturnDto): Promise<AdminReturn> {
    const amount = new Prisma.Decimal(dto.amount)
    if (amount.lte(0))
      throw new UnprocessableEntityException('The refund amount must be more than ৳0.')

    // 1. Reserve: checks + a PENDING refund row, in one locked transaction.
    const reserved = await this.prisma.$transaction(async (tx) => {
      const r = await this.returns.lockAt(tx, returnId, ReturnStatus.RECEIVED)
      const order = await tx.order.findUniqueOrThrow({ where: { id: r.orderId } })
      const payment = await tx.payment.findFirst({
        where: {
          orderId: r.orderId,
          status: { in: [PaymentStatus.PAID, PaymentStatus.PARTIALLY_REFUNDED] },
        },
      })
      if (!payment)
        throw new ConflictException({
          message: 'This order has no completed payment to refund.',
          code: 'NOTHING_TO_REFUND',
        })
      await tx.$queryRaw`SELECT id FROM payments WHERE id = ${payment.id}::uuid FOR UPDATE`
      const refunds = await tx.refund.findMany({ where: { paymentId: payment.id } })
      if (refunds.some((f) => f.status === RefundStatus.PENDING && f.returnRequestId === returnId))
        throw new ConflictException({
          message: 'A refund for this return is already in progress.',
          code: 'REFUND_IN_PROGRESS',
        })
      const left = payment.amount.minus(reservedRefunds(refunds))
      if (amount.gt(left))
        throw new UnprocessableEntityException({
          message: `At most ৳${left.toString()} can still be refunded for this order.`,
          code: 'REFUND_TOO_LARGE',
        })

      const method = dto.method
      if (
        method === 'GATEWAY' &&
        (payment.method !== PaymentMethod.SSLCOMMERZ || !payment.bankTransactionId)
      )
        throw new ConflictException({
          message: 'This order was not paid online — record a manual refund instead.',
          code: 'NOT_AN_ONLINE_PAYMENT',
        })

      const refund = await tx.refund.create({
        data: {
          paymentId: payment.id,
          returnRequestId: returnId,
          amount,
          reason: `Return of ${displayNumber(order.orderNumber)}`,
          status: method === 'MANUAL' ? RefundStatus.PROCESSED : RefundStatus.PENDING,
          ...(method === 'MANUAL' && {
            processedAt: new Date(),
            rawResponse: { method: 'MANUAL', reference: dto.reference ?? null },
          }),
        },
      })
      if (method === 'MANUAL') await this.finish(tx, refund.id)
      return { refund, payment, orderNumber: order.orderNumber }
    })
    if (dto.method === 'MANUAL') {
      await this.refunded(reserved.refund.id)
      return this.returns.adminView(returnId)
    }

    // 2. Ask SSLCommerz — outside the transaction (it can take seconds).
    const result = await this.gateway.refundPayment({
      bankTransactionId: reserved.payment.bankTransactionId!,
      refundTransactionId: newRefundTransactionId(reserved.orderNumber),
      amount: amount.toString(),
      remarks: `Return of ${displayNumber(reserved.orderNumber)}`,
      reference: reserved.refund.id,
    })

    // 3. Record what happened.
    const done = await this.prisma.$transaction(async (tx) => {
      const raw = (result.raw ?? null) as Prisma.InputJsonValue
      if (result.ok && result.status === 'refunded') {
        await tx.refund.update({
          where: { id: reserved.refund.id },
          data: {
            status: RefundStatus.PROCESSED,
            processedAt: new Date(),
            gatewayRefId: result.refundRefId,
            rawResponse: raw,
          },
        })
        await this.finish(tx, reserved.refund.id)
        return true
      } else if (result.ok) {
        // "processing": reconcile() asks again later.
        await tx.refund.update({
          where: { id: reserved.refund.id },
          data: { gatewayRefId: result.refundRefId, rawResponse: raw },
        })
      } else if (result.raw === null) {
        // No answer at all: unknown — stays PENDING for an admin to resolve (rule 3).
        await tx.refund.update({
          where: { id: reserved.refund.id },
          data: { rawResponse: { unknown: true, reason: result.reason } },
        })
        this.logger.error(
          `ALERT refund ${reserved.refund.id}: SSLCommerz did not answer — check the panel, then resolve`,
        )
      } else {
        // SSLCommerz clearly refused: nothing was sent, so trying again is safe.
        await tx.refund.update({
          where: { id: reserved.refund.id },
          data: {
            status: RefundStatus.FAILED,
            rawResponse: { reason: result.reason, response: raw },
          },
        })
      }
      return false
    })
    if (done) await this.refunded(reserved.refund.id)
    if (!result.ok && result.raw !== null)
      throw new BadGatewayException({
        message: `SSLCommerz refused the refund: ${result.reason}`,
        code: 'REFUND_REFUSED',
      })
    return this.returns.adminView(returnId)
  }

  /**
   * PATCH /returns/:id/refunds/:refundId/resolve — for a refund SSLCommerz
   * never answered about: after checking the SSLCommerz panel, the admin
   * records whether the money went back.
   */
  async resolve(returnId: string, refundId: string, dto: ResolveRefundDto): Promise<AdminReturn> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM refunds WHERE id = ${refundId}::uuid FOR UPDATE`
      const refund = await tx.refund.findFirst({
        where: { id: refundId, returnRequestId: returnId },
      })
      if (!refund) throw new NotFoundException('Refund not found')
      if (refund.status !== RefundStatus.PENDING)
        throw new ConflictException({
          message: 'This refund is already settled.',
          code: 'REFUND_SETTLED',
        })
      const note = { resolvedBy: 'admin', outcome: dto.outcome, note: dto.note }
      if (dto.outcome === 'REFUNDED') {
        await tx.refund.update({
          where: { id: refundId },
          data: { status: RefundStatus.PROCESSED, processedAt: new Date(), rawResponse: note },
        })
        await this.finish(tx, refundId)
      } else {
        await tx.refund.update({
          where: { id: refundId },
          data: { status: RefundStatus.FAILED, rawResponse: note },
        })
      }
    })
    if (dto.outcome === 'REFUNDED') await this.refunded(refundId)
    return this.returns.adminView(returnId)
  }

  @Interval(FIFTEEN_MINUTES_MS)
  async runReconcile(): Promise<void> {
    const n = await this.reconcile()
    if (n > 0) this.logger.log(`Settled ${n} processing refund(s)`)
  }

  /** Refunds SSLCommerz said were "processing": ask again. Returns how many settled. */
  async reconcile(): Promise<number> {
    const waiting = await this.prisma.refund.findMany({
      where: { status: RefundStatus.PENDING, gatewayRefId: { not: null } },
      take: 100,
    })
    let settled = 0
    for (const refund of waiting) {
      const status = await this.gateway.getRefundStatus(refund.gatewayRefId!)
      if (status.state === 'REFUNDED') {
        const done = await this.prisma.$transaction(async (tx) => {
          const updated = await tx.refund.updateMany({
            where: { id: refund.id, status: RefundStatus.PENDING },
            data: {
              status: RefundStatus.PROCESSED,
              processedAt: new Date(),
              rawResponse: status.raw as Prisma.InputJsonValue,
            },
          })
          if (updated.count === 1) await this.finish(tx, refund.id)
          return updated.count === 1
        })
        if (done) await this.refunded(refund.id)
        settled++
      } else if (status.state === 'CANCELLED') {
        await this.prisma.refund.updateMany({
          where: { id: refund.id, status: RefundStatus.PENDING },
          data: { status: RefundStatus.FAILED, rawResponse: status.raw as Prisma.InputJsonValue },
        })
        this.logger.warn(`Refund ${refund.id} was cancelled at SSLCommerz — it can be tried again`)
        settled++
      }
    }
    return settled
  }

  /** "Refund processed" email (step 28) — only after the refund is saved as done. Best effort. */
  private async refunded(refundId: string) {
    await this.notifier
      .refundProcessed(refundId)
      .catch((e: unknown) => this.logger.error(`Refund notification failed: ${String(e)}`))
  }

  /**
   * A refund is done: the return is REFUNDED; the payment and order show
   * REFUNDED or PARTIALLY_REFUNDED; and if every item of the order has come
   * back, the order itself is RETURNED.
   */
  private async finish(tx: Prisma.TransactionClient, refundId: string): Promise<void> {
    const refund = await tx.refund.findUniqueOrThrow({
      where: { id: refundId },
      include: { payment: true },
    })
    const all = await tx.refund.findMany({
      where: { paymentId: refund.paymentId, status: RefundStatus.PROCESSED },
    })
    const refunded = all.reduce((sum, f) => sum.plus(f.amount), new Prisma.Decimal(0))
    const paymentStatus = refunded.gte(refund.payment.amount)
      ? PaymentStatus.REFUNDED
      : PaymentStatus.PARTIALLY_REFUNDED

    if (refund.returnRequestId)
      await tx.returnRequest.update({
        where: { id: refund.returnRequestId },
        data: { status: ReturnStatus.REFUNDED, refundAmount: refund.amount },
      })
    await tx.payment.update({ where: { id: refund.paymentId }, data: { status: paymentStatus } })

    const order = await tx.order.findUniqueOrThrow({
      where: { id: refund.payment.orderId },
      include: { items: true },
    })
    const returned = await tx.returnItem.groupBy({
      by: ['orderItemId'],
      where: {
        returnRequest: {
          orderId: order.id,
          status: { in: [ReturnStatus.RECEIVED, ReturnStatus.REFUNDED] },
        },
      },
      _sum: { quantity: true },
    })
    const back = new Map(returned.map((r) => [r.orderItemId, r._sum.quantity ?? 0]))
    const everythingBack = order.items.every((i) => (back.get(i.id) ?? 0) >= i.quantity)
    await tx.order.update({
      where: { id: order.id },
      data: {
        paymentStatus,
        ...(everythingBack &&
          order.status === OrderStatus.DELIVERED && {
            status: OrderStatus.RETURNED,
            statusHistory: {
              create: {
                fromStatus: order.status,
                toStatus: OrderStatus.RETURNED,
                note: 'All items returned and refunded',
              },
            },
          }),
      },
    })
  }
}
