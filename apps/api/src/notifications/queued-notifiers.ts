import { Injectable } from '@nestjs/common'
import { metaEventJobId, notificationJobId, orderJobId } from '@nowoll/queues'
import { PrismaService } from '../prisma/prisma.service.js'
import type { LowStockAlert, LowStockAlerter } from '../inventory/low-stock-alerter.js'
import type {
  OrderNotifier,
  OrderPlacedEvent,
  PaymentConfirmedEvent,
} from '../orders/order-notifier.js'
import type { CustomerNotifier } from './customer-notifier.js'
import {
  MarketingQueueService,
  NotificationsQueueService,
  OrdersQueueService,
} from './orders-queue.js'

/**
 * Meta server events (step 39b) — queued ONLY for orders whose customer
 * allowed "Marketing" (their order has a saved order_tracking row). Whether
 * the switch is on and the token set is checked by the worker, which logs a
 * "skipped" line Rafi can see in Admin → Marketing.
 */
@Injectable()
export class QueuedMarketingEvents {
  constructor(
    private readonly queue: MarketingQueueService,
    private readonly prisma: PrismaService,
  ) {}

  async orderEvent(kind: 'purchase' | 'delivered', orderId: string): Promise<void> {
    const consented = await this.prisma.orderTracking.findUnique({
      where: { orderId },
      select: { order: { select: { orderNumber: true } } },
    })
    if (!consented) return
    await this.queue.add(
      'meta-event',
      { kind, orderId },
      { jobId: metaEventJobId(kind, consented.order.orderNumber) },
    )
  }
}

/**
 * Order events → jobs for the order worker (step 27 decision #2):
 *   cash on delivery placed → confirmation email now
 *   online order placed     → nothing yet (it may never be paid, and expire)
 *   online payment confirmed→ "Payment received ✓" with the receipt
 * Fixed job IDs: the same event twice is still ONE email.
 */
@Injectable()
export class QueuedOrderNotifier implements OrderNotifier {
  constructor(
    private readonly queue: OrdersQueueService,
    private readonly marketing: QueuedMarketingEvents,
  ) {}

  // A sale for Meta (step 39b): cash on delivery when placed, online when paid.
  async orderPlaced(e: OrderPlacedEvent): Promise<void> {
    if (e.paymentMethod !== 'COD') return
    await this.queue.add(
      'order-confirmation',
      { orderId: e.orderId },
      { jobId: orderJobId('order-confirmation', e.orderNumber) },
    )
    await this.marketing.orderEvent('purchase', e.orderId)
  }

  async paymentConfirmed(e: PaymentConfirmedEvent): Promise<void> {
    await this.queue.add(
      'payment-confirmed',
      { orderId: e.orderId },
      { jobId: orderJobId('payment-confirmed', e.orderNumber) },
    )
    await this.marketing.orderEvent('purchase', e.orderId)
  }
}

/** Low stock → a job; the order worker emails the admin. */
@Injectable()
export class QueuedLowStockAlerter implements LowStockAlerter {
  constructor(private readonly queue: OrdersQueueService) {}

  async notify(alerts: LowStockAlert[]): Promise<void> {
    if (alerts.length > 0) await this.queue.add('low-stock-alert', { alerts })
  }
}

/** Account, newsletter, returns, refunds, shipping → jobs for the notification worker. */
@Injectable()
export class QueuedCustomerNotifier implements CustomerNotifier {
  constructor(
    private readonly queue: NotificationsQueueService,
    private readonly marketing: QueuedMarketingEvents,
  ) {}

  async welcome(userId: string) {
    await this.queue.add('welcome', { userId }, { jobId: notificationJobId('welcome', userId) })
  }
  async newsletterSignup(subscriberId: string, token: string) {
    // Part of the token in the id: re-subscribing (new token) may send a new confirmation.
    const key = `${subscriberId}_${token.slice(0, 12)}`
    await this.queue.add(
      'newsletter-confirm',
      { subscriberId },
      { jobId: notificationJobId('newsletter-confirm', key) },
    )
  }
  async returnApproved(returnId: string) {
    await this.queue.add(
      'return-approved',
      { returnId },
      { jobId: notificationJobId('return-approved', returnId) },
    )
  }
  async returnRejected(returnId: string) {
    await this.queue.add(
      'return-rejected',
      { returnId },
      { jobId: notificationJobId('return-rejected', returnId) },
    )
  }
  async refundProcessed(refundId: string) {
    await this.queue.add(
      'refund-processed',
      { refundId },
      { jobId: notificationJobId('refund-processed', refundId) },
    )
  }
  async orderShipped(orderId: string) {
    await this.queue.add(
      'order-shipped',
      { orderId },
      { jobId: notificationJobId('order-shipped', orderId) },
    )
  }
  async orderDelivered(orderId: string) {
    await this.queue.add(
      'order-delivered',
      { orderId },
      { jobId: notificationJobId('order-delivered', orderId) },
    )
    await this.marketing.orderEvent('delivered', orderId) // "OrderDelivered" for Meta (step 39b)
  }
  // Newsletter → Resend (step 42). Each change is its own job (the worker reads
  // the CURRENT state, so an older job running late can't undo a newer change).
  async newsletterSync(subscriberId: string) {
    await this.queue.add(
      'newsletter-sync',
      { subscriberId },
      { jobId: notificationJobId('newsletter-sync', `${subscriberId}_${Date.now()}`) },
    )
  }
  async newsletterErase(email: string) {
    await this.queue.add('newsletter-erase', { email })
  }
  async newsletterSyncAll() {
    // One per minute at most (double clicks are one job).
    const minute = Math.floor(Date.now() / 60_000)
    await this.queue.add(
      'newsletter-sync-all',
      {},
      { jobId: notificationJobId('newsletter-sync-all', String(minute)) },
    )
  }
}
