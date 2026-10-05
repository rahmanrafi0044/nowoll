import { Body, Controller, HttpCode, Post } from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import { CheckoutService } from './checkout.service.js'
import { CheckoutQuoteDto } from './dto/checkout-quote.dto.js'

const ONE_MINUTE_MS = 60_000

@Controller('checkout')
export class CheckoutController {
  constructor(private readonly checkout: CheckoutService) {}

  // 20 per minute per visitor: checkout re-quotes as the address and code
  // change (a handful of calls), but this endpoint also evaluates discount
  // codes — so it's tighter than the general 100/min to slow code guessing.
  @Post('quote')
  @HttpCode(200)
  @Throttle({ default: { ttl: ONE_MINUTE_MS, limit: 20 } })
  quote(@Body() dto: CheckoutQuoteDto) {
    return this.checkout.quote(dto)
  }
}
