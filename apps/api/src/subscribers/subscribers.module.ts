import { Module } from '@nestjs/common'
import { SubscribersController } from './subscribers.controller.js'
import { SubscribersService } from './subscribers.service.js'

@Module({ controllers: [SubscribersController], providers: [SubscribersService] })
export class SubscribersModule {}
