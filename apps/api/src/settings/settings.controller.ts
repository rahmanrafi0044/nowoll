import { Body, Controller, Get, Header, Patch } from '@nestjs/common'
import { IsObject } from 'class-validator'
import { AdminOnly } from '../common/decorators/admin-only.decorator.js'
import { SettingsService } from './settings.service.js'

class UpdateSettingsDto {
  /** { setting_key: value, … } — each checked by the shared SETTINGS_SCHEMA in the service. */
  @IsObject()
  values!: Record<string, unknown>
}

// Public, read-only: the shop's name, contact details, social links… (step 38).
@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get('public')
  public() {
    return this.settings.public()
  }
}

// Admin → Settings (step 38, part 1). Staff + 2FA.
@Controller('admin/settings')
@AdminOnly()
export class AdminSettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  all() {
    return this.settings.all()
  }

  @Patch()
  update(@Body() dto: UpdateSettingsDto) {
    return this.settings.update(dto.values)
  }
}
