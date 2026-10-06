export interface OrderPlacedEvent {
  orderId: string
  orderNumber: number
  email: string
  paymentMethod: string
  total: string
}

export interface PaymentConfirmedEvent {
  orderId: string
  orderNumber: number
}

// ADAPTER PATTERN (like LowStockAlerter): "an order was placed" / "a payment
// was confirmed" is reported here; what happens next is someone else's job.
// The real adapter (notifications/queued-order-notifier.ts) puts a job on the
// orders queue — the order worker sends the email (CLAUDE.md §10). Tests use a
// recording fake (test/utils/services.ts).
export interface OrderNotifier {
  orderPlaced(event: OrderPlacedEvent): Promise<void>
  paymentConfirmed(event: PaymentConfirmedEvent): Promise<void>
}

export const ORDER_NOTIFIER = Symbol('ORDER_NOTIFIER')
