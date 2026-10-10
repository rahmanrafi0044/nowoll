import { Module } from '@nestjs/common'
import { AdminSettingsController, SettingsController } from './settings.controller.js'
import { BrandImagesService } from './brand-images.service.js'
import { SettingsService } from './settings.service.js'

@Module({
  controllers: [SettingsController, AdminSettingsController],
  providers: [SettingsService, BrandImagesService],
  exports: [SettingsService],
})
export class SettingsModule {}
