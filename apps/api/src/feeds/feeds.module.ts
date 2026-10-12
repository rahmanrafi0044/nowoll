import { Module } from '@nestjs/common'
import { CategoriesModule } from '../categories/categories.module.js'
import { SettingsModule } from '../settings/settings.module.js'
import { CatalogFeedService } from './catalog-feed.service.js'
import { AdminFeedsController, FeedsController } from './feeds.controller.js'

// Product feeds for advertising platforms (step 39c: Meta's catalogue).
@Module({
  imports: [CategoriesModule, SettingsModule],
  controllers: [FeedsController, AdminFeedsController],
  providers: [CatalogFeedService],
})
export class FeedsModule {}
