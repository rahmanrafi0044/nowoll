import { Module } from '@nestjs/common'
import { SettingsModule } from '../settings/settings.module.js'
import { InventoryController } from './inventory.controller.js'
import { InventoryService } from './inventory.service.js'
import { LOW_STOCK_ALERTER, LoggingLowStockAlerter } from './low-stock-alerter.js'
import { StockService } from './stock.service.js'

@Module({
  imports: [SettingsModule],
  controllers: [InventoryController],
  providers: [
    InventoryService,
    StockService,
    // Phase 4: swap for a BullMQ-backed alerter (emails via the notification worker).
    { provide: LOW_STOCK_ALERTER, useClass: LoggingLowStockAlerter },
  ],
  exports: [StockService], // products (and later orders) change stock through it
})
export class InventoryModule {}
