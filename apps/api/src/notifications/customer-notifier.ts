// ADAPTER PATTERN, like ORDER_NOTIFIER: services report "this happened" and
// the queued adapter turns it into a job for the notification worker (step 28).
// Tests use a recording fake (test/utils/services.ts).
export interface CustomerNotifier {
  welcome(userId: string): Promise<void>
  /** `token` = the subscriber's secret link token: a new sign-up cycle = a new confirmation email. */
  newsletterSignup(subscriberId: string, token: string): Promise<void>
  returnApproved(returnId: string): Promise<void>
  returnRejected(returnId: string): Promise<void>
  refundProcessed(refundId: string): Promise<void>
  /** For the admin order screen (Phase 5, step 31) — nothing calls these yet. */
  orderShipped(orderId: string): Promise<void>
  orderDelivered(orderId: string): Promise<void>
}

export const CUSTOMER_NOTIFIER = Symbol('CUSTOMER_NOTIFIER')
