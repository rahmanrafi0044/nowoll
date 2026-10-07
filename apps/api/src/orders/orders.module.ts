import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module.js'
import { CheckoutModule } from '../checkout/checkout.module.js'
import { DiscountsModule } from '../discounts/discounts.module.js'
import { InventoryModule } from '../inventory/inventory.module.js'
import { PaymentsModule } from '../payments/payments.module.js'
import { SettingsModule } from '../settings/settings.module.js'
import { AdminOrdersController } from './admin-orders.controller.js'
import { AdminOrdersService } from './admin-orders.service.js'
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
  // OrdersController FIRST: its fixed paths (/my, /track) must be matched
  // before the admin controller's /:id.
  controllers: [OrdersController, AdminOrdersController],
  providers: [OrdersService, OrderExpiryService, OrderLookupService, AdminOrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
