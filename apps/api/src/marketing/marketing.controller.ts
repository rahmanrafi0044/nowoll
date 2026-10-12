import { Body, Controller, Get, Header, Headers, HttpCode, Ip, Post } from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import type { AdminProfile } from '../admin-auth/admin-auth.service.js'
import { AdminOnly } from '../common/decorators/admin-only.decorator.js'
import { CurrentAdmin } from '../common/guards/admin.guard.js'
import { TestEventDto } from './dto/test-event.dto.js'
import { MarketingService } from './marketing.service.js'

// /api/v1/admin/marketing — step 39b. ADMIN only (Meta setup is a store-owner job).
@Controller('admin/marketing')
@AdminOnly({ role: 'ADMIN' })
export class MarketingController {
  constructor(private readonly marketing: MarketingService) {}

  @Get('status')
  @Header('Cache-Control', 'no-store')
  status() {
    return this.marketing.status()
  }

  @Get('events')
  @Header('Cache-Control', 'no-store')
  log() {
    return this.marketing.log()
  }

  /** At most 5 a minute — it calls Meta each time. */
  @Post('test-event')
  @HttpCode(200)
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  testEvent(
    @Body() dto: TestEventDto,
    @CurrentAdmin() admin: AdminProfile | undefined,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string | undefined,
  ) {
    return this.marketing.sendTest(
      dto.testEventCode,
      { email: admin?.email ?? '' },
      ip,
      (userAgent ?? 'Nowoll admin').slice(0, 500),
    )
  }
}
