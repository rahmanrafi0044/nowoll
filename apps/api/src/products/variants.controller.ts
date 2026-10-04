import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common'
import { AdminOnly } from '../common/decorators/admin-only.decorator.js'
import { CreateVariantDto } from './dto/create-variant.dto.js'
import { UpdateVariantDto } from './dto/update-variant.dto.js'
import { VariantsService } from './variants.service.js'

// Routes from the spec's route map: /variants/product/:productId, /variants/:id
@Controller('variants')
export class VariantsController {
  constructor(private readonly variants: VariantsService) {}

  @Get('product/:productId')
  listForProduct(@Param('productId', ParseUUIDPipe) productId: string) {
    return this.variants.listForProduct(productId)
  }

  @Post('product/:productId')
  @AdminOnly()
  create(@Param('productId', ParseUUIDPipe) productId: string, @Body() dto: CreateVariantDto) {
    return this.variants.create(productId, dto)
  }

  @Patch(':id')
  @AdminOnly()
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateVariantDto) {
    return this.variants.update(id, dto)
  }

  @Delete(':id')
  @AdminOnly()
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.variants.remove(id)
  }
}
