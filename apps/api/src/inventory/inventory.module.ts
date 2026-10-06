import { Module } from '@nestjs/common'
import { SettingsModule } from '../settings/settings.module.js'
import { InventoryController } from './inventory.controller.js'
import { InventoryService } from './inventory.service.js'
import { StockService } from './stock.service.js'

@Module({
  imports: [SettingsModule],
  controllers: [InventoryController],
  providers: [
    InventoryService,
    StockService, // its LOW_STOCK_ALERTER comes from the global NotificationsModule
  ],
  exports: [StockService], // products (and later orders) change stock through it
})
export class InventoryModule {}
