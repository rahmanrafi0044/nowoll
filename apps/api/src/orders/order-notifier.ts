import { Injectable, Logger } from '@nestjs/common'

export interface OrderPlacedEvent {
  orderId: string
  orderNumber: number
  email: string
  paymentMethod: string
  total: string
}

// ADAPTER PATTERN (like LowStockAlerter): "an order was placed" is reported
// here; what happens next is someone else's job.
//   Now: logs a line.
//   Phase 4 (CLAUDE.md §10): a BullMQ adapter queues a job — the order worker
//   sends the confirmation email, and later books the courier.
export interface OrderNotifier {
  orderPlaced(event: OrderPlacedEvent): Promise<void>
}

export const ORDER_NOTIFIER = Symbol('ORDER_NOTIFIER')

@Injectable()
export class LoggingOrderNotifier implements OrderNotifier {
  private readonly logger = new Logger('Orders')

  async orderPlaced(e: OrderPlacedEvent): Promise<void> {
    // TODO(phase 4): replace with the BullMQ adapter (confirmation email).
    this.logger.log(
      `Order NW-${e.orderNumber} placed (${e.paymentMethod}, ৳${e.total}) — confirmation email arrives in Phase 4`,
    )
  }
}
