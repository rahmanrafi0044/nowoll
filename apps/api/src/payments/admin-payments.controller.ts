import { Controller, Get, Header } from '@nestjs/common'
import { AdminOnly } from '../common/decorators/admin-only.decorator.js'
import { PaymentsService } from './payments.service.js'

// /api/v1/admin/payments/status — step 38c. Admin → Settings → Payments warns
// when "Online payment" is on but the SSLCommerz keys aren't on the server
// (adding them is developer-side, CLAUDE.md Rule 9). Never returns the keys.
@Controller('admin/payments')
// ADMIN only (step 38e).
@AdminOnly({ role: 'ADMIN' })
export class AdminPaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get('status')
  @Header('Cache-Control', 'no-store')
  status() {
    return { onlineConfigured: this.payments.onlineConfigured() }
  }
}
