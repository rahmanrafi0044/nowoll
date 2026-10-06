import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module.js'
import { CheckoutModule } from '../checkout/checkout.module.js'
import { DiscountsModule } from '../discounts/discounts.module.js'
import { InventoryModule } from '../inventory/inventory.module.js'
import { PaymentsModule } from '../payments/payments.module.js'
import { SettingsModule } from '../settings/settings.module.js'
import { OrderExpiryService } from './order-expiry.service.js'
import { OrderLookupService } from './order-lookup.service.js'
import { OrdersController } from './orders.controller.js'
import { OrdersService } from './orders.service.js'

@Module({
  imports: [
    AuthModule,
    CheckoutModule,
    DiscountsModule,
    InventoryModule,
    PaymentsModule,
    SettingsModule,
  ],
  controllers: [OrdersController],
  providers: [OrdersService, OrderExpiryService, OrderLookupService],
  exports: [OrdersService],
})
export class OrdersModule {}
