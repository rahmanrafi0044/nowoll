import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common'
import { AdminOnly } from '../common/decorators/admin-only.decorator.js'
import { CreateProductDto } from './dto/create-product.dto.js'
import { ListProductsQuery } from './dto/list-products.query.js'
import { UpdateProductDto } from './dto/update-product.dto.js'
import { ProductsService } from './products.service.js'

@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  list(@Query() query: ListProductsQuery) {
    return this.products.list(query)
  }

  // NOTE: fixed paths like /products/export (commit 4) must be declared ABOVE
  // this route — NestJS matches routes in order, and ':slug' matches anything.
  @Get(':slug')
  findBySlug(@Param('slug') slug: string) {
    return this.products.findBySlug(slug)
  }

  @Post()
  @AdminOnly()
  create(@Body() dto: CreateProductDto) {
    return this.products.create(dto)
  }

  @Patch(':id')
  @AdminOnly()
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateProductDto) {
    return this.products.update(id, dto)
  }

  @Delete(':id')
  @AdminOnly()
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.products.remove(id)
  }
}
