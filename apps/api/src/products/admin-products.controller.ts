import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common'
import { AdminOnly } from '../common/decorators/admin-only.decorator.js'
import { AdminProductsService } from './admin-products.service.js'
import { AdminProductsQuery, BulkProductsDto } from './dto/admin-products.dto.js'

// /api/v1/admin/products — the admin panel's view of the catalog (step 30a).
// Creating, editing, images, variants and CSV stay on /products/* (all admin-only there).
@Controller('admin/products')
@AdminOnly()
export class AdminProductsController {
  constructor(private readonly adminProducts: AdminProductsService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  list(@Query() query: AdminProductsQuery) {
    return this.adminProducts.list(query)
  }

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminProducts.detail(id)
  }

  @Post('bulk')
  @HttpCode(200)
  bulk(@Body() dto: BulkProductsDto) {
    return this.adminProducts.bulk(dto.action, dto.ids)
  }
}
