import { Module } from '@nestjs/common'
import { AdminPagesController } from './admin-pages.controller.js'
import { PagesController } from './pages.controller.js'
import { PagesService } from './pages.service.js'

// Static pages: public reads (footer, /privacy…) and the admin editor (step 36 part 2).
@Module({
  controllers: [PagesController, AdminPagesController],
  providers: [PagesService],
})
export class PagesModule {}
