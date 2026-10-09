import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common'
import { AdminOnly } from '../common/decorators/admin-only.decorator.js'
import { CreatePageDto } from './dto/create-page.dto.js'
import { ListPagesQuery } from './dto/list-pages.query.js'
import { UpdatePageDto } from './dto/update-page.dto.js'
import { PagesService } from './pages.service.js'

// /api/v1/admin/pages — step 36 part 2. Staff + 2FA.
@Controller('admin/pages')
@AdminOnly()
export class AdminPagesController {
  constructor(private readonly pages: PagesService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  list(@Query() query: ListPagesQuery) {
    return this.pages.list(query.status)
  }

  @Post('starter')
  addStarters() {
    return this.pages.addStarters()
  }

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.pages.detail(id)
  }

  @Post()
  create(@Body() dto: CreatePageDto) {
    return this.pages.create(dto)
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePageDto) {
    return this.pages.update(id, dto)
  }

  @Delete(':id')
  archive(@Param('id', ParseUUIDPipe) id: string) {
    return this.pages.archive(id)
  }
}
