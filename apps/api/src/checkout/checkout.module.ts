import { Module } from '@nestjs/common'
import { DiscountsModule } from '../discounts/discounts.module.js'
import { SettingsModule } from '../settings/settings.module.js'
import { ShippingModule } from '../shipping/shipping.module.js'
import { CheckoutController } from './checkout.controller.js'
import { CheckoutService } from './checkout.service.js'

@Module({
  imports: [DiscountsModule, ShippingModule, SettingsModule],
  controllers: [CheckoutController],
  providers: [CheckoutService],
  exports: [CheckoutService], // the orders module (step 18) re-runs the same quote
})
export class CheckoutModule {}
