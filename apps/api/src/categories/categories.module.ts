import { Module } from '@nestjs/common'
import { CategoriesController } from './categories.controller.js'
import { CategoriesService } from './categories.service.js'

@Module({
  controllers: [CategoriesController],
  providers: [CategoriesService],
  exports: [CategoriesService], // the products module will need it in step 10
})
export class CategoriesModule {}
