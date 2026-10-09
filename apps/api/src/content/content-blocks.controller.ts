import { Controller, Get, Param } from '@nestjs/common'
import { ContentBlocksService } from './content-blocks.service.js'

// Public, read-only. Editing: admin-content.controller.ts (step 36).
@Controller('content-blocks')
export class ContentBlocksController {
  constructor(private readonly blocks: ContentBlocksService) {}

  @Get(':key')
  findOne(@Param('key') key: string) {
    return this.blocks.findActive(key)
  }
}
