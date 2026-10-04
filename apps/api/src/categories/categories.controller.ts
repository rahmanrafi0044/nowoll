import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common'
import { AdminOnly } from '../common/decorators/admin-only.decorator.js'
import { CategoriesService } from './categories.service.js'
import { CreateCategoryDto } from './dto/create-category.dto.js'
import { UpdateCategoryDto } from './dto/update-category.dto.js'

// CONTROLLER: maps HTTP routes to service methods — no business logic here.
// Routes from the API route map in docs/00-master-spec.md.
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  findTree() {
    return this.categories.findTree()
  }

  @Get(':slug')
  findBySlug(@Param('slug') slug: string) {
    return this.categories.findBySlug(slug)
  }

  @Post()
  @AdminOnly()
  create(@Body() dto: CreateCategoryDto) {
    return this.categories.create(dto)
  }

  // ParseUUIDPipe rejects malformed ids with 400 before touching the database.
  @Patch(':id')
  @AdminOnly()
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCategoryDto) {
    return this.categories.update(id, dto)
  }

  @Delete(':id')
  @AdminOnly()
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.categories.remove(id)
  }
}
