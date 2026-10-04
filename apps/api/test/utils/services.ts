// Builds real services wired to the test database, for service-level tests.
import { StockService } from '../../src/inventory/stock.service.js'
import type { LowStockAlert, LowStockAlerter } from '../../src/inventory/low-stock-alerter.js'
import type { PrismaService } from '../../src/prisma/prisma.service.js'
import { SettingsService } from '../../src/settings/settings.service.js'

/** Test double: remembers every low-stock alert instead of logging/emailing it. */
export class RecordingLowStockAlerter implements LowStockAlerter {
  readonly alerts: LowStockAlert[] = []
  async notify(alerts: LowStockAlert[]): Promise<void> {
    this.alerts.push(...alerts)
  }
}

export function makeStockService(prisma: PrismaService, alerter = new RecordingLowStockAlerter()) {
  return { stock: new StockService(new SettingsService(prisma), alerter), alerter }
}
