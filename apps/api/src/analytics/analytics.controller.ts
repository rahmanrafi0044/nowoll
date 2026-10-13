import { Controller, Get, Header, Query } from '@nestjs/common'
import { AdminOnly } from '../common/decorators/admin-only.decorator.js'
import { RequireRole } from '../common/guards/admin-role.guard.js'
import { AnalyticsService } from './analytics.service.js'
import {
  CustomersQuery,
  PeriodQuery,
  RevenueQuery,
  TopCategoriesQuery,
  TopProductsQuery,
} from './dto/analytics.query.js'
import { periodFor } from './period.js'

// Routes from the spec's route map (analytics/). All admin-panel only (staff + 2FA).
// The dashboard's numbers (summary, revenue, top products) are open to STAFF;
// the analytics page's detail (categories' money, customers' spending,
// cancellation rates) is ADMIN only (step 40).
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
    return this.analytics.revenue(periodFor(query, new Date()), query.groupBy)
  }

  @Get('top-products')
  @Header('Cache-Control', 'no-store')
  topProducts(@Query() query: TopProductsQuery) {
    return this.analytics.topProducts(periodFor(query, new Date()), query.limit)
  }

  @Get('top-categories')
  @RequireRole('ADMIN')
  @Header('Cache-Control', 'no-store')
  topCategories(@Query() query: TopCategoriesQuery) {
    return this.analytics.topCategories(periodFor(query, new Date()), query.level, query.limit)
  }

  @Get('customers')
  @RequireRole('ADMIN')
  @Header('Cache-Control', 'no-store')
  customers(@Query() query: CustomersQuery) {
    return this.analytics.customers(periodFor(query, new Date()), query.limit)
  }

  @Get('orders')
  @RequireRole('ADMIN')
  @Header('Cache-Control', 'no-store')
  orders(@Query() query: PeriodQuery) {
    return this.analytics.orders(periodFor(query, new Date()))
  }
}
