import { Controller, Get, Header, NotFoundException, StreamableFile } from '@nestjs/common'
import { AdminOnly } from '../common/decorators/admin-only.decorator.js'
import { CatalogFeedService } from './catalog-feed.service.js'

// GET /api/v1/feeds/meta-catalog.csv — public: Meta's servers fetch it on a
// schedule. It holds only what the shop already shows (step 39c).
@Controller('feeds')
export class FeedsController {
  constructor(private readonly feed: CatalogFeedService) {}

  @Get('meta-catalog.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=3600')
  async metaCatalog() {
    const csv = await this.feed.feed()
    // Switched off → as if it didn't exist (nothing to read for anyone).
    if (csv === null) throw new NotFoundException('Not found')
    return new StreamableFile(Buffer.from(csv, 'utf8'))
  }
}

// GET /api/v1/admin/feeds/meta-catalog — what Admin → Marketing shows about the feed.
@Controller('admin/feeds')
@AdminOnly({ role: 'ADMIN' })
export class AdminFeedsController {
  constructor(private readonly feed: CatalogFeedService) {}

  @Get('meta-catalog')
  @Header('Cache-Control', 'no-store')
  report() {
    return this.feed.report()
  }
}
