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
import type { AdminProfile } from '../admin-auth/admin-auth.service.js'
import { AdminOnly } from '../common/decorators/admin-only.decorator.js'
import { CurrentAdmin } from '../common/guards/admin.guard.js'
import { BlogService } from './blog.service.js'
import { AdminBlogListQuery, BlogListQuery, SaveBlogPostDto } from './dto/blog.dto.js'

// GET /api/v1/blog… — the shop (live posts only).
@Controller('blog')
export class BlogController {
  constructor(private readonly blog: BlogService) {}

  @Get()
  list(@Query() q: BlogListQuery) {
    return this.blog.list(q.page, q.tag)
  }

  /** Every live post, for /sitemap.xml. (Fixed path, so it comes before :slug.) */
  @Get('sitemap')
  sitemap() {
    return this.blog.sitemap()
  }

  @Get(':slug')
  findOne(@Param('slug') slug: string) {
    return this.blog.findLive(slug)
  }
}

// /api/v1/admin/blog — Admin → Content → Blog. Staff + Admin (content is
// Staff work — step 38e).
@Controller('admin/blog')
@AdminOnly()
export class AdminBlogController {
  constructor(private readonly blog: BlogService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  list(@Query() q: AdminBlogListQuery) {
    return this.blog.adminList(q.status)
  }

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.blog.detail(id)
  }

  @Post()
  create(@Body() dto: SaveBlogPostDto, @CurrentAdmin() admin?: AdminProfile) {
    return this.blog.create(dto, admin?.id ?? null)
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SaveBlogPostDto) {
    return this.blog.update(id, dto)
  }

  /** Archive (soft delete) — restore with PATCH. */
  @Delete(':id')
  archive(@Param('id', ParseUUIDPipe) id: string) {
    return this.blog.archive(id)
  }
}
