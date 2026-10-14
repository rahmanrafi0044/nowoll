import { Module } from '@nestjs/common'
import { ProductsModule } from '../products/products.module.js'
import { AdminBlogController, BlogController } from './blog.controller.js'
import { BlogService } from './blog.service.js'

// The blog (step 43). IMAGE_STORAGE comes from the global storage module.
@Module({
  imports: [ProductsModule],
  controllers: [BlogController, AdminBlogController],
  providers: [BlogService],
})
export class BlogModule {}
