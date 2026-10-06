import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module.js'
import { InventoryModule } from '../inventory/inventory.module.js'
import { PaymentsModule } from '../payments/payments.module.js'
import { SettingsModule } from '../settings/settings.module.js'
import { RefundsService } from './refunds.service.js'
import { ReturnsController } from './returns.controller.js'
import { ReturnsService } from './returns.service.js'

@Module({
  imports: [AuthModule, InventoryModule, PaymentsModule, SettingsModule],
  controllers: [ReturnsController],
  providers: [ReturnsService, RefundsService],
})
export class ReturnsModule {}
