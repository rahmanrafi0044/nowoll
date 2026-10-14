import { Controller, Get, Param } from '@nestjs/common'
import { type ContentBlockKey, PRIVATE_CONTENT_BLOCKS } from '@nowoll/validation'
import { ContentBlocksService } from './content-blocks.service.js'

// Public, read-only. Editing: admin-content.controller.ts (step 36).
@Controller('content-blocks')
export class ContentBlocksController {
  constructor(private readonly blocks: ContentBlocksService) {}

  @Get(':key')
  findOne(@Param('key') key: string) {
    // Blocks the shop never needs (the email wording, step 43b) aren't public.
    if ((PRIVATE_CONTENT_BLOCKS as readonly string[]).includes(key as ContentBlockKey)) return null
    return this.blocks.findActive(key)
  }
}
