import { Body, Controller, HttpCode, Post } from '@nestjs/common'
import { StrictRateLimit } from '../common/decorators/strict-rate-limit.decorator.js'
import { CreateStockAlertDto } from './stock-alerts.dto.js'
import { StockAlertsService } from './stock-alerts.service.js'

@Controller('stock-alerts')
export class StockAlertsController {
  constructor(private readonly alerts: StockAlertsService) {}

  // 5 per minute per IP (like the newsletter form): stops bots filling the
  // table with addresses that would then all get emails.
  @Post()
  @HttpCode(200)
  @StrictRateLimit()
  create(@Body() dto: CreateStockAlertDto) {
    return this.alerts.create(dto)
  }
}
