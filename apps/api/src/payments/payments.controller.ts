import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Res } from '@nestjs/common'
import { SkipThrottle, Throttle } from '@nestjs/throttler'
import type { Response } from 'express'
import { StrictRateLimit } from '../common/decorators/strict-rate-limit.decorator.js'
import { InitPaymentDto } from './dto/init-payment.dto.js'
import { PaymentsService } from './payments.service.js'

const ONE_MINUTE_MS = 60_000

// The SSLCommerz callbacks (ipn, success, fail, cancel) take the form body as a
// plain object on purpose: SSLCommerz decides its fields, not us, and a
// DTO with forbidNonWhitelisted would REJECT a real payment notification the
// day SSLCommerz adds a field. Nothing in it is trusted anyway — the service
// only reads tran_id/val_id and asks SSLCommerz itself.
type GatewayForm = Record<string, unknown>

@Controller('payment')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  /** "Pay now": returns the SSLCommerz page to send the customer to. 5/min (CLAUDE.md §8). */
  @Post('sslcommerz/init')
  @HttpCode(200)
  @StrictRateLimit()
  init(@Body() dto: InitPaymentDto) {
    return this.payments.init(dto.orderId)
  }

  /**
   * SSLCommerz's server → ours. NEVER rate-limited: these come from a few
   * SSLCommerz IPs, and a dropped notification could leave a paid order unpaid.
   * Answers 200 once handled (SSLCommerz retries otherwise).
   */
  @Post('sslcommerz/ipn')
  @HttpCode(200)
  @SkipThrottle()
  async ipn(@Body() body: GatewayForm) {
    await this.payments.handleIpn(body ?? {})
    return { received: true }
  }

  // The customer's browser, sent back by SSLCommerz (a form POST). 303 See Other
  // turns it into a normal GET of the storefront page — no "resubmit form?" prompt.
  @Post('sslcommerz/success')
  @SkipThrottle()
  async success(@Body() body: GatewayForm, @Res() res: Response) {
    res.redirect(303, await this.payments.handleRedirect('success', body ?? {}))
  }

  @Post('sslcommerz/fail')
  @SkipThrottle()
  async fail(@Body() body: GatewayForm, @Res() res: Response) {
    res.redirect(303, await this.payments.handleRedirect('fail', body ?? {}))
  }

  @Post('sslcommerz/cancel')
  @SkipThrottle()
  async cancel(@Body() body: GatewayForm, @Res() res: Response) {
    res.redirect(303, await this.payments.handleRedirect('cancel', body ?? {}))
  }

  /** The "thank you" page polls this every few seconds — 30/min is plenty. */
  @Get('status/:orderId')
  @Throttle({ default: { ttl: ONE_MINUTE_MS, limit: 30 } })
  status(@Param('orderId', ParseUUIDPipe) orderId: string) {
    return this.payments.status(orderId)
  }
}
