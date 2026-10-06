export interface LowStockAlert {
  variantId: string
  sku: string
  productName: string
  variantLabel: string // "M / Blue"
  stock: number // current count
  threshold: number
}

// ADAPTER PATTERN (again): stock code reports "this variant just ran low" to
// this interface and doesn't care what happens next. The real adapter
// (notifications/queued-low-stock-alerter.ts) queues a job and the order
// worker emails the admin (step 27, CLAUDE.md §10). Tests record alerts.
export interface LowStockAlerter {
  notify(alerts: LowStockAlert[]): Promise<void>
}

export const LOW_STOCK_ALERTER = Symbol('LOW_STOCK_ALERTER')
