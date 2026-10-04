import { Injectable, Logger } from '@nestjs/common'

export interface LowStockAlert {
  variantId: string
  sku: string
  productName: string
  variantLabel: string // "M / Blue"
  stock: number // current count
  threshold: number
}

// ADAPTER PATTERN (again): stock code reports "this variant just ran low" to
// this interface and doesn't care what happens next.
//   Now (Phase 2): LoggingLowStockAlerter writes a warning to the API log.
//   Phase 4: a BullMQ adapter queues a job; the notification worker emails the
//            admin via Resend (CLAUDE.md §10). Only the provider below changes.
export interface LowStockAlerter {
  notify(alerts: LowStockAlert[]): Promise<void>
}

export const LOW_STOCK_ALERTER = Symbol('LOW_STOCK_ALERTER')

@Injectable()
export class LoggingLowStockAlerter implements LowStockAlerter {
  private readonly logger = new Logger('LowStock')

  async notify(alerts: LowStockAlert[]): Promise<void> {
    for (const a of alerts) {
      // TODO(phase 4): replace this adapter with one that queues the alert email.
      this.logger.warn(
        `${a.productName} (${a.variantLabel}, SKU ${a.sku}) is low: ${a.stock} left (threshold ${a.threshold})`,
      )
    }
  }
}
