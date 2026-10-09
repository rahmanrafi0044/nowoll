import { Controller, Get, Param } from '@nestjs/common'
import { PagesService } from './pages.service.js'

// Public, read-only: the shop's footer and its /<slug> pages (step 36 part 2).
@Controller('pages')
export class PagesController {
  constructor(private readonly pages: PagesService) {}

  @Get()
  list() {
    return this.pages.listPublished()
  }

  @Get(':slug')
  findOne(@Param('slug') slug: string) {
    return this.pages.findPublished(slug)
  }
}
