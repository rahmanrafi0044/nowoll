import { Module } from '@nestjs/common'
import { ContentBlocksController } from './content-blocks.controller.js'
import { ContentBlocksService } from './content-blocks.service.js'

@Module({ controllers: [ContentBlocksController], providers: [ContentBlocksService] })
export class ContentModule {}
