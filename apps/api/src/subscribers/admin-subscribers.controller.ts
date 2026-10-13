import {
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  StreamableFile,
} from '@nestjs/common'
import { AdminOnly } from '../common/decorators/admin-only.decorator.js'
import { AdminSubscribersQuery } from './dto/admin-subscribers.dto.js'
import { SubscribersService } from './subscribers.service.js'

// /api/v1/admin/subscribers — Admin → Newsletter (step 42). ADMIN only: a list
// of people's email addresses is personal data.
@Controller('admin/subscribers')
@AdminOnly({ role: 'ADMIN' })
export class AdminSubscribersController {
  constructor(private readonly subscribers: SubscribersService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  list(@Query() q: AdminSubscribersQuery) {
    return this.subscribers.adminPage(q)
  }

  @Get('export.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="nowoll-newsletter-subscribers.csv"')
  @Header('Cache-Control', 'no-store')
  async export() {
    return new StreamableFile(await this.subscribers.exportCsv())
  }

  @Get('resend')
  @Header('Cache-Control', 'no-store')
  resendStatus() {
    return this.subscribers.syncStatus()
  }

  @Post('resend/sync-all')
  @HttpCode(200)
  syncAll() {
    return this.subscribers.syncAll()
  }

  @Patch(':id/unsubscribe')
  unsubscribe(@Param('id', ParseUUIDPipe) id: string) {
    return this.subscribers.adminUnsubscribe(id)
  }

  @Delete(':id')
  erase(@Param('id', ParseUUIDPipe) id: string) {
    return this.subscribers.erase(id)
  }
}
