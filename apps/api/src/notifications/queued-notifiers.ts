import { Injectable } from '@nestjs/common'
import { notificationJobId, orderJobId } from '@nowoll/queues'
import type { LowStockAlert, LowStockAlerter } from '../inventory/low-stock-alerter.js'
import type {
  OrderNotifier,
  OrderPlacedEvent,
  PaymentConfirmedEvent,
} from '../orders/order-notifier.js'
import type { CustomerNotifier } from './customer-notifier.js'
import { NotificationsQueueService, OrdersQueueService } from './orders-queue.js'

/**
 * Order events → jobs for the order worker (step 27 decision #2):
 *   cash on delivery placed → confirmation email now
 *   online order placed     → nothing yet (it may never be paid, and expire)
 *   online payment confirmed→ "Payment received ✓" with the receipt
 * Fixed job IDs: the same event twice is still ONE email.
 */
@Injectable()
export class QueuedOrderNotifier implements OrderNotifier {
  constructor(private readonly queue: OrdersQueueService) {}

  async orderPlaced(e: OrderPlacedEvent): Promise<void> {
    if (e.paymentMethod !== 'COD') return
    await this.queue.add(
      'order-confirmation',
      { orderId: e.orderId },
      { jobId: orderJobId('order-confirmation', e.orderNumber) },
    )
  }

  async paymentConfirmed(e: PaymentConfirmedEvent): Promise<void> {
    await this.queue.add(
      'payment-confirmed',
      { orderId: e.orderId },
      { jobId: orderJobId('payment-confirmed', e.orderNumber) },
    )
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
  constructor(private readonly queue: NotificationsQueueService) {}

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
  }
}
