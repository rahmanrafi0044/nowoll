import { Module } from '@nestjs/common'
import { AdminContentController } from './admin-content.controller.js'
import { ContentBlocksController } from './content-blocks.controller.js'
import { ContentBlocksService } from './content-blocks.service.js'
import { ContentImagesService } from './content-images.service.js'
import { EmailWordingController } from './email-wording.controller.js'

// Storefront content: public reads (content-blocks) and the admin editors (step 36);
// the email wording (step 43b, ADMIN only).
@Module({
  controllers: [ContentBlocksController, AdminContentController, EmailWordingController],
  providers: [ContentBlocksService, ContentImagesService],
})
export class ContentModule {}
