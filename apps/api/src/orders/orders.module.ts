import { Module } from '@nestjs/common'
import { CheckoutModule } from '../checkout/checkout.module.js'
import { DiscountsModule } from '../discounts/discounts.module.js'
import { InventoryModule } from '../inventory/inventory.module.js'
import { PaymentsModule } from '../payments/payments.module.js'
import { SettingsModule } from '../settings/settings.module.js'
import { LoggingOrderNotifier, ORDER_NOTIFIER } from './order-notifier.js'
import { OrderExpiryService } from './order-expiry.service.js'
import { OrderLookupService } from './order-lookup.service.js'
import { OrdersController } from './orders.controller.js'
import { OrdersService } from './orders.service.js'

@Module({
  imports: [CheckoutModule, DiscountsModule, InventoryModule, PaymentsModule, SettingsModule],
  controllers: [OrdersController],
  providers: [
    OrdersService,
    OrderExpiryService,
    OrderLookupService,
    // Phase 4: swap for the BullMQ adapter (confirmation email via the order worker).
    { provide: ORDER_NOTIFIER, useClass: LoggingOrderNotifier },
  ],
  exports: [OrdersService],
})
export class OrdersModule {}
