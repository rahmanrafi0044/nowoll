import { Module } from '@nestjs/common'
import { AnalyticsController } from './analytics.controller.js'
import { AnalyticsService } from './analytics.service.js'

// Admin analytics (step 29b dashboard; step 40 adds categories, customers, ranges).
@Module({
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
})
export class AnalyticsModule {}
