import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common'
import { AdminOnly } from '../common/decorators/admin-only.decorator.js'
import { CurrentAdmin } from '../common/guards/admin.guard.js'
import type { AdminProfile } from '../admin-auth/admin-auth.service.js'
import { ChangeRoleDto, GrantStaffDto } from './dto/staff.dto.js'
import { StaffService } from './staff.service.js'

// /api/v1/admin/staff — step 38e. ADMIN only, always.
@Controller('admin/staff')
@AdminOnly({ role: 'ADMIN' })
export class StaffController {
  constructor(private readonly staff: StaffService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  page(@CurrentAdmin() admin?: AdminProfile) {
    return this.staff.page(admin?.id ?? null)
  }

  @Post()
  grant(@Body() dto: GrantStaffDto, @CurrentAdmin() admin?: AdminProfile) {
    return this.staff.grant(dto.email, dto.role, admin?.id ?? null)
  }

  @Patch(':id')
  changeRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeRoleDto,
    @CurrentAdmin() admin?: AdminProfile,
  ) {
    return this.staff.changeRole(id, dto.role, admin?.id ?? null)
  }

  @Delete(':id')
  revoke(@Param('id', ParseUUIDPipe) id: string, @CurrentAdmin() admin?: AdminProfile) {
    return this.staff.revoke(id, admin?.id ?? null)
  }

  @Post(':id/reset-2fa')
  @HttpCode(200)
  resetTwoFactor(@Param('id', ParseUUIDPipe) id: string, @CurrentAdmin() admin?: AdminProfile) {
    return this.staff.resetTwoFactor(id, admin?.id ?? null)
  }
}
