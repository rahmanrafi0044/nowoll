import {
  BadGatewayException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common'
import { Interval } from '@nestjs/schedule'
import { Prisma } from '@nowoll/database'
import { OrderStatus, PaymentEventType, PaymentMethod, PaymentStatus } from '@nowoll/database/enums'
import {
  canPayOnline,
  type GatewayStatus,
  type PaymentProvider,
  type VerifyResult,
} from '@nowoll/payments'
import { displayNumber } from '../orders/order-number.js'
import { PrismaService } from '../prisma/prisma.service.js'
import { SettingsService } from '../settings/settings.service.js'
import { PAYMENT_GATEWAY, PAYMENTS_CONFIG, type PaymentsConfig } from './payment-gateway.js'
import { newTransactionId } from './transaction-id.js'

// ============================================================================
// ONLINE PAYMENTS (SSLCommerz) — docs/integrations/sslcommerz.md
//
// The golden rule (CLAUDE.md §9): NOTHING the gateway sends us is believed on
// its own. A payment notification (IPN) or a browser redirect only tells us
// WHICH payment to check; the answer always comes from asking SSLCommerz
// ourselves — the validation API (with val_id) or the transaction query (with
// our tran_id). A forged "status=VALID" POST therefore changes nothing.
//
// One order can have several payment ATTEMPTS (decision #1): each "Pay" sends
// a fresh tran_id, because SSLCommerz needs a unique id per transaction.
// ============================================================================

const FIVE_MINUTES_MS = 5 * 60 * 1000

/** What a validated payment did to its order. */
export type SettleEffect =
  | 'CONFIRMED' // money in, order confirmed
  | 'UNDER_REVIEW' // money is in, but a human must check (risky, late or duplicate)
  | 'UNVERIFIED' // SSLCommerz couldn't be asked — under review until reconcile() gets an answer
  | 'ALREADY_SETTLED' // seen before (the IPN and the redirect both report it) — nothing changed
  | 'NOT_PAID' // SSLCommerz says this val_id is not a valid payment for this attempt

/** What the unpaid-order sweep should do with an order (decision #4). */
export type ExpiryCheck = 'PAID' | 'UNKNOWN' | 'NOT_PAID'

export interface PaymentStatusSummary {
  orderId: string
  displayNumber: string
  status: OrderStatus
  paymentMethod: PaymentMethod
  paymentStatus: PaymentStatus
  total: Prisma.Decimal
  /** True while "Try paying again" can still work (unpaid and within the payment window). */
  canRetry: boolean
}

type Payload = Record<string, unknown>
const text = (v: unknown) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)
const json = (v: unknown) => (v ?? null) as Prisma.InputJsonValue

/** The val_id of a paid transaction in a transaction-query answer (raw.element[]). */
export function paidValId(raw: unknown): string | null {
  const elements = (raw as { element?: unknown } | null)?.element
  if (!Array.isArray(elements)) return null
  for (const e of elements as Payload[]) {
    if ((e.status === 'VALID' || e.status === 'VALIDATED') && text(e.val_id)) return text(e.val_id)
  }
  return null
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentProvider,
    @Inject(PAYMENTS_CONFIG) private readonly config: PaymentsConfig,
  ) {}

  /** Why an order of this total can't be paid online right now — or null if it can. */
  onlinePaymentProblem(total: string): { code: string; message: string } | null {
    if (!this.config.onlineEnabled)
      return {
        code: 'ONLINE_PAYMENT_UNAVAILABLE',
        message: "Online payment isn't available right now. Please choose cash on delivery.",
      }
    if (!canPayOnline(total))
      return {
        code: 'ONLINE_PAYMENT_AMOUNT',
        message: 'Online payment is available for orders from ৳10 to ৳5,00,000.',
      }
    return null
  }

  // --------------------------------------------------------------------------
  // 1. Start paying: POST /payment/sslcommerz/init
  // --------------------------------------------------------------------------

  /** Asks SSLCommerz for a payment page for this order; returns where to send the customer. */
  async init(orderId: string, now = new Date()): Promise<{ redirectUrl: string }> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true, payments: { orderBy: { createdAt: 'asc' } } },
    })
    if (!order) throw new NotFoundException('Order not found')
    const label = displayNumber(order.orderNumber)

    if (order.paymentMethod !== PaymentMethod.SSLCOMMERZ)
      throw new ConflictException({
        message: `Order ${label} is paid on delivery.`,
        code: 'NOT_AN_ONLINE_ORDER',
      })
    if (order.paymentStatus === PaymentStatus.PAID)
      throw new ConflictException({
        message: `Order ${label} is already paid.`,
        code: 'ALREADY_PAID',
      })
    if (order.paymentStatus === PaymentStatus.UNDER_REVIEW)
      throw new ConflictException({
        message: `We've received a payment for order ${label} and are checking it. Please don't pay again.`,
        code: 'PAYMENT_UNDER_REVIEW',
      })
    if (order.status !== OrderStatus.PENDING || (await this.pastPaymentWindow(order, now)))
      throw new ConflictException({
        message: `Order ${label} has expired because it wasn't paid in time. Please place a new order.`,
        code: 'ORDER_EXPIRED',
      })
    const problem = this.onlinePaymentProblem(order.total.toString())
    if (problem)
      throw problem.code === 'ONLINE_PAYMENT_UNAVAILABLE'
        ? new ServiceUnavailableException(problem)
        : new UnprocessableEntityException(problem)

    const attempt = await this.claimAttempt(order, now)
    const address = [order.shippingAddressLine1, order.shippingAddressLine2, order.shippingArea]
      .filter(Boolean)
      .join(', ')
    const place = { address, city: order.shippingDistrict, postcode: order.shippingPostalCode }
    const base = `${this.config.apiPublicUrl}/api/v1/payment/sslcommerz`
    const result = await this.gateway.createPayment({
      transactionId: attempt.transactionId,
      amount: attempt.amount.toString(),
      customer: { name: order.customerName, email: order.email, phone: order.phone, ...place },
      shipping: { name: order.customerName, ...place },
      productNames: [...new Set(order.items.map((i) => i.productName))],
      itemCount: order.items.reduce((sum, i) => sum + i.quantity, 0),
      urls: {
        success: `${base}/success`,
        fail: `${base}/fail`,
        cancel: `${base}/cancel`,
        ipn: `${base}/ipn`,
      },
    })

    if (!result.ok) {
      // Nothing reached SSLCommerz → the attempt can be used for the next try.
      if (result.reason === 'NOT_CONFIGURED' || result.reason === 'AMOUNT_OUT_OF_RANGE') {
        await this.prisma.payment.update({
          where: { id: attempt.id },
          data: { initiatedAt: null },
        })
      }
      this.logger.warn(`${label}: payment ${attempt.transactionId} not started — ${result.reason}`)
      const error = { message: result.message, code: `PAYMENT_${result.reason}` }
      throw result.reason === 'GATEWAY_REFUSED'
        ? new BadGatewayException(error)
        : result.reason === 'AMOUNT_OUT_OF_RANGE'
          ? new UnprocessableEntityException(error)
          : new ServiceUnavailableException(error)
    }
    if (!result.redirectUrl)
      throw new BadGatewayException('The payment service sent no payment page.')
    this.logger.log(`${label}: payment ${attempt.transactionId} started`)
    return { redirectUrl: result.redirectUrl }
  }

  /**
   * Picks the payment attempt to send. The attempt created with the order is
   * used for the FIRST "Pay"; every later "Pay" gets a new attempt with a new
   * tran_id. "Claiming" is one conditional UPDATE (… WHERE initiated_at IS
   * NULL), so two clicks at the same moment can never send the same tran_id twice.
   */
  private async claimAttempt(
    order: {
      id: string
      orderNumber: number
      total: Prisma.Decimal
      payments: { id: string; status: PaymentStatus; initiatedAt: Date | null }[]
    },
    now: Date,
  ) {
    const unsent = order.payments.find(
      (p) => p.initiatedAt === null && p.status === PaymentStatus.PENDING,
    )
    if (unsent) {
      const claimed = await this.prisma.payment.updateMany({
        where: { id: unsent.id, initiatedAt: null },
        data: { initiatedAt: now },
      })
      if (claimed.count === 1)
        return this.prisma.payment.findUniqueOrThrow({ where: { id: unsent.id } })
    }
    return this.prisma.payment.create({
      data: {
        orderId: order.id,
        method: PaymentMethod.SSLCOMMERZ,
        status: PaymentStatus.PENDING,
        amount: order.total,
        transactionId: newTransactionId(order.orderNumber),
        initiatedAt: now,
      },
    })
  }

  // --------------------------------------------------------------------------
  // 2. SSLCommerz tells us something happened: the IPN and the browser redirects
  // --------------------------------------------------------------------------

  /** POST /payment/sslcommerz/ipn — SSLCommerz's server telling us about a payment. */
  async handleIpn(payload: Payload): Promise<void> {
    const payment = await this.recordEvent(PaymentEventType.IPN, payload)
    if (!payment) return
    const valId = text(payload.val_id)
    // The IPN's own "status" field is deliberately NOT read (it could be forged).
    const effect = valId ? await this.settle(payment.id, valId) : 'NOT_PAID'
    if (effect === 'NOT_PAID') await this.confirmFailure(payment.id)
  }

  /**
   * The customer's browser coming back from SSLCommerz. A redirect is not
   * proof of anything, but checking here (decision #6) means the customer
   * usually sees "Paid ✓" straight away instead of waiting for the IPN.
   * Returns the storefront page to send them to — even if something fails here.
   */
  async handleRedirect(kind: 'success' | 'fail' | 'cancel', payload: Payload): Promise<string> {
    const site = this.config.siteUrl
    try {
      const type = {
        success: PaymentEventType.REDIRECT_SUCCESS,
        fail: PaymentEventType.REDIRECT_FAIL,
        cancel: PaymentEventType.REDIRECT_CANCEL,
      }[kind]
      const payment = await this.recordEvent(type, payload)
      if (!payment) return `${site}/checkout?payment=error`

      const order = encodeURIComponent(payment.orderId)
      const failed = (reason: 'fail' | 'cancel') =>
        `${site}/checkout/payment-failed?order=${order}&reason=${reason}`
      if (kind === 'success') {
        const valId = text(payload.val_id)
        const effect = valId ? await this.settle(payment.id, valId) : 'NOT_PAID'
        return effect === 'NOT_PAID' ? failed('fail') : `${site}/checkout/success?order=${order}`
      }
      await this.confirmFailure(payment.id)
      return failed(kind)
    } catch (error) {
      this.logger.error(`Payment ${kind} redirect could not be processed: ${String(error)}`)
      return `${site}/checkout?payment=error`
    }
  }

  /**
   * Stores the payload FIRST (the audit trail — sslcommerz.md "Error handling"),
   * then finds our payment attempt. An unknown tran_id is logged and ignored.
   */
  private async recordEvent(type: PaymentEventType, payload: Payload) {
    const tranId = text(payload.tran_id)
    const payment = tranId
      ? await this.prisma.payment.findUnique({ where: { transactionId: tranId } })
      : null
    await this.prisma.paymentEvent.create({
      data: { paymentId: payment?.id ?? null, transactionId: tranId, type, payload: json(payload) },
    })
    if (!payment || payment.method !== PaymentMethod.SSLCOMMERZ) {
      this.logger.warn(`${type} for unknown transaction ${tranId ?? '(none)'} — stored, ignored`)
      return null
    }
    return payment
  }

  // --------------------------------------------------------------------------
  // 3. The decision: validate with SSLCommerz, then update the order
  // --------------------------------------------------------------------------

  /**
   * Validates `valId` with SSLCommerz and applies the answer. Safe to call
   * any number of times for the same payment (IPN + redirect + reconcile):
   * the order row is locked, so the second caller sees the first one's result.
   */
  async settle(paymentId: string, valId: string): Promise<SettleEffect> {
    const payment = await this.prisma.payment.findUniqueOrThrow({ where: { id: paymentId } })
    if (alreadySettled(payment, valId)) return 'ALREADY_SETTLED'

    // The network call happens BEFORE the transaction: a slow gateway must
    // never hold a database lock (and so block other orders) for 10 seconds.
    const result = await this.gateway.verifyPayment({
      valId,
      expected: {
        transactionId: payment.transactionId,
        amount: payment.amount.toString(),
        currency: 'BDT',
      },
    })
    await this.prisma.paymentEvent.create({
      data: {
        paymentId,
        transactionId: payment.transactionId,
        type: PaymentEventType.VALIDATION,
        payload: json({ valId, ...validationSummary(result) }),
      },
    })
    if (result.outcome === 'NOT_PAID') {
      this.logger.warn(`Payment ${payment.transactionId}: val_id rejected — ${result.reason}`)
      return 'NOT_PAID'
    }

    return this.prisma.$transaction(async (tx) => {
      // Same lock as OrdersService.cancel(): a payment and the expiry sweep
      // for the same order take turns — never both at once.
      await tx.$queryRaw`SELECT id FROM orders WHERE id = ${payment.orderId}::uuid FOR UPDATE`
      const order = await tx.order.findUniqueOrThrow({
        where: { id: payment.orderId },
        include: { payments: true },
      })
      const current = order.payments.find((p) => p.id === paymentId)!
      if (alreadySettled(current, valId)) return 'ALREADY_SETTLED' as const
      const label = `${displayNumber(order.orderNumber)} / ${payment.transactionId}`

      // Validation server unreachable: we can't know — so we never guess.
      // valId stays null, which is how reconcile() finds it later (decision #4).
      if (result.outcome === 'UNREACHABLE') {
        await tx.payment.update({
          where: { id: paymentId },
          data: { status: PaymentStatus.UNDER_REVIEW },
        })
        if (order.status === OrderStatus.PENDING && order.paymentStatus === PaymentStatus.PENDING) {
          // Also stops the sweep from cancelling an order that may well be paid.
          await tx.order.update({
            where: { id: order.id },
            data: { paymentStatus: PaymentStatus.UNDER_REVIEW },
          })
        }
        this.logger.error(
          `ALERT ${label}: could not validate payment (${result.reason}) — will retry`,
        )
        return 'UNVERIFIED' as const
      }

      const { details } = result
      const paid = {
        valId: details.valId,
        bankTransactionId: details.bankTransactionId,
        cardType: details.cardType,
        rawResponse: json(result.raw),
        paidAt: new Date(),
      }
      // Money for this order already received through another attempt?
      // (Customer paid in two tabs.) An unverified attempt (valId null) doesn't count.
      const moneyAlreadyIn = order.payments.some(
        (p) =>
          p.id !== paymentId &&
          (p.status === PaymentStatus.PAID ||
            (p.status === PaymentStatus.UNDER_REVIEW && p.valId !== null)),
      )
      const reviewReason =
        order.status === OrderStatus.CANCELLED
          ? 'paid after the order was cancelled — refund or restore the order' // decision #3
          : moneyAlreadyIn || order.status !== OrderStatus.PENDING
            ? 'duplicate payment — the order was already paid; refund this one' // decision #5
            : result.outcome === 'REVIEW'
              ? `${result.reason} — check before shipping`
              : null

      if (reviewReason) {
        await tx.payment.update({
          where: { id: paymentId },
          data: { ...paid, status: PaymentStatus.UNDER_REVIEW },
        })
        await tx.order.update({
          where: { id: order.id },
          data: {
            // A duplicate leaves the order PAID (it is); otherwise the order shows "under review".
            ...(!moneyAlreadyIn && { paymentStatus: PaymentStatus.UNDER_REVIEW }),
            adminNotes: appendNote(
              order.adminNotes,
              `Payment ${payment.transactionId}: ${reviewReason}`,
            ),
          },
        })
        // TODO(phase 4): email the admin through the notification worker.
        this.logger.error(`ALERT ${label}: ${reviewReason}`)
        return 'UNDER_REVIEW' as const
      }

      await tx.payment.update({
        where: { id: paymentId },
        data: { ...paid, status: PaymentStatus.PAID },
      })
      await tx.order.update({
        where: { id: order.id },
        data: {
          status: OrderStatus.CONFIRMED,
          paymentStatus: PaymentStatus.PAID,
          confirmedAt: new Date(),
          statusHistory: {
            create: {
              fromStatus: order.status,
              toStatus: OrderStatus.CONFIRMED,
              note: `Paid online (${payment.transactionId}${details.cardType ? `, ${details.cardType}` : ''})`,
            },
          },
        },
      })
      this.logger.log(`${label}: paid — order confirmed`)
      return 'CONFIRMED' as const
    })
  }

  /**
   * The customer says the payment failed or was cancelled. We believe it only
   * once SSLCommerz confirms (decision #2) — and if SSLCommerz says it WAS
   * paid after all, we settle it instead. The order itself stays open so the
   * customer can try again until the payment window closes.
   */
  async confirmFailure(paymentId: string): Promise<GatewayStatus['state'] | 'SKIPPED'> {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } })
    if (!payment || payment.status !== PaymentStatus.PENDING || !payment.initiatedAt)
      return 'SKIPPED'
    const status = await this.queryGateway(payment)
    if (status.state === 'PAID') {
      const valId = paidValId(status.raw)
      if (valId) await this.settle(payment.id, valId)
    } else if (status.state === 'FAILED') {
      await this.prisma.payment.updateMany({
        where: { id: payment.id, status: PaymentStatus.PENDING },
        data: { status: PaymentStatus.FAILED },
      })
    }
    return status.state
  }

  /** Transaction query by OUR tran_id; the answer is stored for the audit trail. */
  private async queryGateway(payment: { id: string; transactionId: string }) {
    const status = await this.gateway.getStatus(payment.transactionId)
    await this.prisma.paymentEvent.create({
      data: {
        paymentId: payment.id,
        transactionId: payment.transactionId,
        type: PaymentEventType.VALIDATION,
        payload: json({
          query: 'tran_id',
          state: status.state,
          ...(status.state === 'UNREACHABLE'
            ? { reason: status.reason }
            : { response: status.raw }),
        }),
      },
    })
    return status
  }

  // --------------------------------------------------------------------------
  // 4. Safety nets: before the sweep cancels, and when validation was unreachable
  // --------------------------------------------------------------------------

  /**
   * Decision #4: before an unpaid order is cancelled, ask SSLCommerz whether
   * any attempt that was sent was actually paid (an IPN can get lost).
   *   PAID     → settled now — do NOT cancel
   *   UNKNOWN  → SSLCommerz didn't answer — skip this round, ask again next time
   *   NOT_PAID → safe to cancel
   */
  async checkBeforeExpiry(orderId: string): Promise<ExpiryCheck> {
    const sent = await this.prisma.payment.findMany({
      where: {
        orderId,
        method: PaymentMethod.SSLCOMMERZ,
        status: PaymentStatus.PENDING,
        initiatedAt: { not: null },
      },
    })
    let unknown = false
    for (const payment of sent) {
      const status = await this.queryGateway(payment)
      if (status.state === 'UNREACHABLE') unknown = true
      if (status.state === 'PAID') {
        const valId = paidValId(status.raw)
        if (!valId) {
          unknown = true
          continue
        }
        const effect = await this.settle(payment.id, valId)
        if (effect !== 'NOT_PAID') return 'PAID'
        unknown = true // the two SSLCommerz APIs disagree — leave it for next round
      }
    }
    return unknown ? 'UNKNOWN' : 'NOT_PAID'
  }

  @Interval(FIVE_MINUTES_MS)
  async runReconcile(): Promise<void> {
    const count = await this.reconcile()
    if (count > 0) this.logger.log(`Resolved ${count} unverified payment(s)`)
  }

  /**
   * Payments we couldn't validate (UNDER_REVIEW with no val_id) are asked
   * about again every 5 minutes, until SSLCommerz answers. Returns how many
   * were resolved. TODO(phase 4): move to a BullMQ repeatable job in the payment worker.
   */
  async reconcile(): Promise<number> {
    const unverified = await this.prisma.payment.findMany({
      where: { method: PaymentMethod.SSLCOMMERZ, status: PaymentStatus.UNDER_REVIEW, valId: null },
      take: 100,
    })
    let resolved = 0
    for (const payment of unverified) {
      try {
        const status = await this.queryGateway(payment)
        if (status.state === 'PAID') {
          const valId = paidValId(status.raw)
          const effect = valId ? await this.settle(payment.id, valId) : null
          if (effect && effect !== 'NOT_PAID' && effect !== 'UNVERIFIED') resolved++
        } else if (status.state === 'FAILED' || status.state === 'NOT_FOUND') {
          await this.markUnverifiedFailed(payment.id)
          resolved++
        }
      } catch (error) {
        this.logger.error(`Could not reconcile payment ${payment.transactionId}: ${String(error)}`)
      }
    }
    return resolved
  }

  /** SSLCommerz has no paid record of it: the attempt failed, and the order may be paid (or expire) normally again. */
  private async markUnverifiedFailed(paymentId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const { orderId } = await tx.payment.findUniqueOrThrow({ where: { id: paymentId } })
      await tx.$queryRaw`SELECT id FROM orders WHERE id = ${orderId}::uuid FOR UPDATE`
      const updated = await tx.payment.updateMany({
        where: { id: paymentId, status: PaymentStatus.UNDER_REVIEW, valId: null },
        data: { status: PaymentStatus.FAILED },
      })
      if (updated.count === 0) return
      const stillUnsure = await tx.payment.count({
        where: { orderId, status: PaymentStatus.UNDER_REVIEW },
      })
      if (stillUnsure === 0) {
        await tx.order.updateMany({
          where: {
            id: orderId,
            status: OrderStatus.PENDING,
            paymentStatus: PaymentStatus.UNDER_REVIEW,
          },
          data: { paymentStatus: PaymentStatus.PENDING },
        })
      }
    })
  }

  // --------------------------------------------------------------------------
  // 5. GET /payment/status/:orderId — what the "thank you" page shows
  // --------------------------------------------------------------------------

  async status(orderId: string, now = new Date()): Promise<PaymentStatusSummary> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } })
    if (!order) throw new NotFoundException('Order not found')
    const canRetry =
      order.paymentMethod === PaymentMethod.SSLCOMMERZ &&
      order.status === OrderStatus.PENDING &&
      order.paymentStatus === PaymentStatus.PENDING &&
      !(await this.pastPaymentWindow(order, now))
    return {
      orderId: order.id,
      displayNumber: displayNumber(order.orderNumber),
      status: order.status,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
      total: order.total,
      canRetry,
    }
  }

  /** Online orders must be paid within `payment_timeout_minutes` of being placed (setting). */
  private async pastPaymentWindow(order: { createdAt: Date }, now: Date): Promise<boolean> {
    const minutes = await this.settings.paymentTimeoutMinutes()
    return now.getTime() - order.createdAt.getTime() > minutes * 60_000
  }
}

/** Already applied: PAID, or put under review for this same val_id. */
function alreadySettled(p: { status: PaymentStatus; valId: string | null }, valId: string) {
  return (
    p.status === PaymentStatus.PAID ||
    (p.status === PaymentStatus.UNDER_REVIEW && p.valId === valId)
  )
}

function validationSummary(result: VerifyResult) {
  switch (result.outcome) {
    case 'PAID':
      return { outcome: result.outcome, response: result.raw }
    case 'REVIEW':
    case 'NOT_PAID':
      return { outcome: result.outcome, reason: result.reason, response: result.raw }
    case 'UNREACHABLE':
      return { outcome: result.outcome, reason: result.reason }
  }
}

function appendNote(existing: string | null, note: string): string {
  const line = `[${new Date().toISOString()}] ${note}`
  return existing ? `${existing}\n${line}` : line
}
