import { Controller, Get } from '@nestjs/common'
import { ShippingService } from './shipping.service.js'

// Public. Editing zones: admin-shipping.controller.ts (step 37).
@Controller('shipping')
export class ShippingController {
  constructor(private readonly shipping: ShippingService) {}

  @Get('rates')
  rates() {
    return this.shipping.rates()
  }
}
