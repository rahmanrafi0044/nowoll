import { Body, Controller, Get, Header, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common'
import { AdminOnly } from '../common/decorators/admin-only.decorator.js'
import { CreateShippingZoneDto } from './dto/save-shipping-zone.dto.js'
import { UpdateShippingZoneDto } from './dto/update-shipping-zone.dto.js'
import { ShippingService } from './shipping.service.js'

// /api/v1/admin/shipping/zones — step 37. Staff + 2FA. No DELETE: orders point
// to their zone — switch a zone off instead.
@Controller('admin/shipping/zones')
// ADMIN only (step 38e): delivery fees are shop-wide rules.
@AdminOnly({ role: 'ADMIN' })
export class AdminShippingController {
  constructor(private readonly shipping: ShippingService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  list() {
    return this.shipping.adminZones()
  }

  @Post()
  create(@Body() dto: CreateShippingZoneDto) {
    return this.shipping.createZone(dto)
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateShippingZoneDto) {
    return this.shipping.updateZone(id, dto)
  }
}
