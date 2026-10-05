import { Controller, Get, Param } from '@nestjs/common'
import { ContentBlocksService } from './content-blocks.service.js'

// Public, read-only. Editing arrives with the admin Content page (Phase 5).
@Controller('content-blocks')
export class ContentBlocksController {
  constructor(private readonly blocks: ContentBlocksService) {}

  @Get(':key')
  findOne(@Param('key') key: string) {
    return this.blocks.findActive(key)
  }
}
