import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Post,
  Put,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { IsBoolean, IsDefined } from 'class-validator'
import { AdminOnly } from '../common/decorators/admin-only.decorator.js'
import { MAX_IMAGE_BYTES } from '../storage/image-storage.js'
import { ContentBlocksService } from './content-blocks.service.js'
import { ContentImagesService } from './content-images.service.js'

class SaveContentBlockDto {
  /** Checked against the block's own format in the service (each block has a different shape). */
  @IsDefined()
  data!: unknown

  @IsBoolean()
  isActive!: boolean
}

// /api/v1/admin/content-blocks + /admin/content/images — step 36. Staff + 2FA.
@Controller('admin')
@AdminOnly()
export class AdminContentController {
  constructor(
    private readonly blocks: ContentBlocksService,
    private readonly images: ContentImagesService,
  ) {}

  @Get('content-blocks')
  @Header('Cache-Control', 'no-store')
  list() {
    return this.blocks.listForAdmin()
  }

  @Get('content-blocks/:key')
  @Header('Cache-Control', 'no-store')
  get(@Param('key') key: string) {
    return this.blocks.getForAdmin(key)
  }

  @Put('content-blocks/:key')
  save(@Param('key') key: string, @Body() dto: SaveContentBlockDto) {
    return this.blocks.save(key, dto.data, dto.isActive)
  }

  // Multer stops reading at 5 MB → 413; the service checks the real file type.
  @Post('content/images')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_IMAGE_BYTES, files: 1, fields: 2 } }),
  )
  upload(@UploadedFile() file: { buffer: Buffer } | undefined) {
    return this.images.upload(file)
  }
}
