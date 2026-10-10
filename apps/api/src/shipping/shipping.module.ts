import { Module } from '@nestjs/common'
import { AdminShippingController } from './admin-shipping.controller.js'
import { ShippingController } from './shipping.controller.js'
import { ShippingService } from './shipping.service.js'

@Module({
  controllers: [ShippingController, AdminShippingController],
  providers: [ShippingService],
  exports: [ShippingService],
})
export class ShippingModule {}
