import { Module } from '@nestjs/common'
import { CategoriesModule } from '../categories/categories.module.js'
import { StockAlertsController } from './stock-alerts.controller.js'
import { StockAlertsService } from './stock-alerts.service.js'

// "Notify me when it's back" (38f).
@Module({
  imports: [CategoriesModule],
  controllers: [StockAlertsController],
  providers: [StockAlertsService],
})
export class StockAlertsModule {}
