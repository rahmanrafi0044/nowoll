import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common'
import { AdminOnly } from '../common/decorators/admin-only.decorator.js'
import { CategoriesService } from './categories.service.js'
import { ReorderCategoriesDto } from './dto/reorder-categories.dto.js'

// /api/v1/admin/categories — step 36b. Create / edit / archive stay on
// /categories (POST, PATCH /:id, DELETE /:id — admin-only there too).
@Controller('admin/categories')
@AdminOnly()
export class AdminCategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  /** The whole tree (hidden ones too); ?archived=1 → the archived list. */
  @Get()
  @Header('Cache-Control', 'no-store')
  list(@Query('archived') archived?: string) {
    return archived === '1' ? this.categories.archived() : this.categories.adminTree()
  }

  @Patch('order')
  reorder(@Body() dto: ReorderCategoriesDto) {
    return this.categories.reorder(dto.parentId, dto.ids)
  }

  @Post(':id/restore')
  @HttpCode(200)
  restore(@Param('id', ParseUUIDPipe) id: string) {
    return this.categories.restore(id)
  }
}
