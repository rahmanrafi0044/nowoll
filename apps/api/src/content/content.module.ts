import { Module } from '@nestjs/common'
import { AdminContentController } from './admin-content.controller.js'
import { ContentBlocksController } from './content-blocks.controller.js'
import { ContentBlocksService } from './content-blocks.service.js'
import { ContentImagesService } from './content-images.service.js'

// Storefront content: public reads (content-blocks) and the admin editors (step 36).
@Module({
  controllers: [ContentBlocksController, AdminContentController],
  providers: [ContentBlocksService, ContentImagesService],
})
export class ContentModule {}
