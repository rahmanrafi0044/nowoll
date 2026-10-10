import {
  Body,
  Controller,
  Get,
  Header,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { IsIn, IsObject } from 'class-validator'
import { AdminOnly } from '../common/decorators/admin-only.decorator.js'
import { MAX_IMAGE_BYTES } from '../storage/image-storage.js'
import {
  BRAND_IMAGE_KINDS,
  type BrandImageKind,
  BrandImagesService,
} from './brand-images.service.js'
import { SettingsService } from './settings.service.js'

class UpdateSettingsDto {
  /** { setting_key: value, … } — each checked by the shared SETTINGS_SCHEMA in the service. */
  @IsObject()
  values!: Record<string, unknown>
}

class BrandImageQuery {
  @IsIn(BRAND_IMAGE_KINDS, { message: 'kind must be logo, favicon or share' })
  kind!: BrandImageKind
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
  constructor(
    private readonly settings: SettingsService,
    private readonly images: BrandImagesService,
  ) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  all() {
    return this.settings.all()
  }

  @Patch()
  update(@Body() dto: UpdateSettingsDto) {
    return this.settings.update(dto.values)
  }

  /** Logo / favicon / share image → its address (then saved as a setting). 5 MB → 413. */
  @Post('images')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_IMAGE_BYTES, files: 1, fields: 2 } }),
  )
  uploadImage(
    @Query() query: BrandImageQuery,
    @UploadedFile() file: { buffer: Buffer } | undefined,
  ) {
    return this.images.upload(query.kind, file)
  }
}
