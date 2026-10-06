// Builds real services wired to the test database, for service-level tests.
import { StockService } from '../../src/inventory/stock.service.js'
import type { LowStockAlert, LowStockAlerter } from '../../src/inventory/low-stock-alerter.js'
import type {
  OrderNotifier,
  OrderPlacedEvent,
  PaymentConfirmedEvent,
} from '../../src/orders/order-notifier.js'
import { PaymentsService } from '../../src/payments/payments.service.js'
import type { PrismaService } from '../../src/prisma/prisma.service.js'
import { SettingsService } from '../../src/settings/settings.service.js'
import { FakePaymentGateway } from './fake-payment-gateway.js'

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

/** Test double: remembers every order event instead of queueing a job. */
export class RecordingOrderNotifier implements OrderNotifier {
  readonly placed: OrderPlacedEvent[] = []
  readonly paid: PaymentConfirmedEvent[] = []
  async orderPlaced(e: OrderPlacedEvent): Promise<void> {
    this.placed.push(e)
  }
  async paymentConfirmed(e: PaymentConfirmedEvent): Promise<void> {
    this.paid.push(e)
  }
}

/** The real PaymentsService, talking to the fake SSLCommerz. */
export function makePaymentsService(
  prisma: PrismaService,
  gateway = new FakePaymentGateway(),
  notifier = new RecordingOrderNotifier(),
) {
  const payments = new PaymentsService(
    prisma,
    new SettingsService(prisma),
    gateway,
    {
      apiPublicUrl: 'https://api.nowoll.test',
      siteUrl: 'https://nowoll.test',
      onlineEnabled: true,
    },
    notifier,
  )
  return { payments, gateway, notifier }
}
