import { Injectable } from '@nestjs/common'
import { orderJobId } from '@nowoll/queues'
import type { LowStockAlert, LowStockAlerter } from '../inventory/low-stock-alerter.js'
import type {
  OrderNotifier,
  OrderPlacedEvent,
  PaymentConfirmedEvent,
} from '../orders/order-notifier.js'
import { OrdersQueueService } from './orders-queue.js'

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
