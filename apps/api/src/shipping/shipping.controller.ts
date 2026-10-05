import { Controller, Get } from '@nestjs/common'
import { ShippingService } from './shipping.service.js'

// Admin endpoints for editing zones arrive with the admin Shipping page (Phase 5).
@Controller('shipping')
export class ShippingController {
  constructor(private readonly shipping: ShippingService) {}

  @Get('rates')
  rates() {
    return this.shipping.rates()
  }
}
