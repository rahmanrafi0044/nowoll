import { Global, Module } from '@nestjs/common'
import { AdminRedirectsController, RedirectsController } from './redirects.controller.js'
import { RedirectsService } from './redirects.service.js'

// Redirects (step 43c). @Global: products, categories and pages call
// RedirectsService.moved() when their web address changes.
@Global()
@Module({
  controllers: [RedirectsController, AdminRedirectsController],
  providers: [RedirectsService],
  exports: [RedirectsService],
})
export class RedirectsModule {}
