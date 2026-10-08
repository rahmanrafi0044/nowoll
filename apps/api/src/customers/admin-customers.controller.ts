import { Body, Controller, Get, Header, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common'
import type { AdminProfile } from '../admin-auth/admin-auth.service.js'
import { AdminOnly } from '../common/decorators/admin-only.decorator.js'
import { CurrentAdmin } from '../common/guards/admin.guard.js'
import { AdminCustomersService } from './admin-customers.service.js'
import { AdminCustomersQuery, BanCustomerDto } from './dto/admin-customers.dto.js'

// /api/v1/admin/customers — step 32. Staff + 2FA. Personal data: never cached.
@Controller('admin/customers')
@AdminOnly()
export class AdminCustomersController {
  constructor(private readonly customers: AdminCustomersService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  list(@Query() query: AdminCustomersQuery) {
    return this.customers.list(query)
  }

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.customers.detail(id)
  }

  @Patch(':id/ban')
  @Header('Cache-Control', 'no-store')
  ban(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: BanCustomerDto,
    @CurrentAdmin() admin: AdminProfile | undefined,
  ) {
    return this.customers.ban(id, dto.reason, admin?.id ?? null)
  }

  @Patch(':id/unban')
  @Header('Cache-Control', 'no-store')
  unban(@Param('id', ParseUUIDPipe) id: string) {
    return this.customers.unban(id)
  }
}
