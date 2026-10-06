import { Controller, Get, Header, Query } from '@nestjs/common'
import { AdminOnly } from '../common/decorators/admin-only.decorator.js'
import { AnalyticsService } from './analytics.service.js'
import { RevenueQuery, TopProductsQuery } from './dto/analytics.query.js'

// Routes from the spec's route map (analytics/). All admin-only (staff + 2FA).
// "no-store": business numbers must never sit in a browser or CDN cache.
@Controller('analytics')
@AdminOnly()
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('summary')
  @Header('Cache-Control', 'no-store')
  summary() {
    return this.analytics.summary()
  }

  @Get('revenue')
  @Header('Cache-Control', 'no-store')
  revenue(@Query() query: RevenueQuery) {
    return this.analytics.revenue(query.days)
  }

  @Get('top-products')
  @Header('Cache-Control', 'no-store')
  topProducts(@Query() query: TopProductsQuery) {
    return this.analytics.topProducts(query.days, query.limit)
  }
}
