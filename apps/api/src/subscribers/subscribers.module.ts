import { Module } from '@nestjs/common'
import { SettingsModule } from '../settings/settings.module.js'
import { AdminSubscribersController } from './admin-subscribers.controller.js'
import { ResendWebhookController } from './resend-webhook.controller.js'
import { SubscribersController } from './subscribers.controller.js'
import { SubscribersService } from './subscribers.service.js'

// The newsletter list (steps 28 and 42): sign-up and links, Admin → Newsletter,
// and the Resend webhook. Exported for the checkout's "email me" box.
@Module({
  imports: [SettingsModule],
  controllers: [SubscribersController, AdminSubscribersController, ResendWebhookController],
  providers: [SubscribersService],
  exports: [SubscribersService],
})
export class SubscribersModule {}
