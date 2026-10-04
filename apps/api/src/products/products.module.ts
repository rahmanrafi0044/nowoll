import { Module } from '@nestjs/common'
import { CategoriesModule } from '../categories/categories.module.js'
import { ProductsController } from './products.controller.js'
import { ProductsService } from './products.service.js'
import { VariantsController } from './variants.controller.js'
import { VariantsService } from './variants.service.js'

@Module({
  imports: [CategoriesModule], // for visible-category lookups and breadcrumbs
  controllers: [ProductsController, VariantsController],
  providers: [ProductsService, VariantsService],
  exports: [ProductsService],
})
export class ProductsModule {}
