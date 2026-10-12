import { Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { SettingsModule } from '../settings/settings.module.js'
import { MarketingController } from './marketing.controller.js'
import { MarketingService } from './marketing.service.js'
import { META_SENDER, metaSenderFromConfig } from './meta-sender.js'

// Admin → Marketing (step 39b). Tests replace META_SENDER with a fake.
@Module({
  imports: [SettingsModule],
  controllers: [MarketingController],
  providers: [
    MarketingService,
    { provide: META_SENDER, inject: [ConfigService], useFactory: metaSenderFromConfig },
  ],
})
export class MarketingModule {}
