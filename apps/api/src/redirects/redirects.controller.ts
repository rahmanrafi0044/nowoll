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
import { RedirectListQuery, SaveRedirectDto } from './dto/redirect.dto.js'
import { RedirectsService } from './redirects.service.js'

// GET /api/v1/redirects — the active rules, for the shop's proxy (public: they
// only say "this old address now lives there").
@Controller('redirects')
export class RedirectsController {
  constructor(private readonly redirects: RedirectsService) {}

  @Get()
  @Header('Cache-Control', 'public, max-age=60')
  rules() {
    return this.redirects.rules()
  }
}

// /api/v1/admin/redirects — Admin → Content → Redirects. Staff + Admin.
@Controller('admin/redirects')
@AdminOnly()
export class AdminRedirectsController {
  constructor(private readonly redirects: RedirectsService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  list(@Query() q: RedirectListQuery) {
    return this.redirects.list(q.q)
  }

  @Post()
  create(@Body() dto: SaveRedirectDto) {
    return this.redirects.create(dto)
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SaveRedirectDto) {
    return this.redirects.update(id, dto)
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.redirects.remove(id)
  }
}
