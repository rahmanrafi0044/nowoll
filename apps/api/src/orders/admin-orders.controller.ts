import { Body, Controller, Get, Header, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common'
import type { AdminProfile } from '../admin-auth/admin-auth.service.js'
import { AdminOnly } from '../common/decorators/admin-only.decorator.js'
import { CurrentAdmin } from '../common/guards/admin.guard.js'
import { AdminOrdersService } from './admin-orders.service.js'
import {
  AdminOrdersQuery,
  OrderNotesDto,
  OrderStatusChangeDto,
  OrderTrackingDto,
} from './dto/admin-orders.dto.js'

// The spec's admin order routes (step 31), all staff + 2FA. The customer's
// own views stay in OrdersController (/orders/my, /track, /:id/receipt).
// "no-store": order details are personal data — never cached.
@Controller('orders')
@AdminOnly()
export class AdminOrdersController {
  constructor(private readonly adminOrders: AdminOrdersService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  list(@Query() query: AdminOrdersQuery) {
    return this.adminOrders.list(query)
  }

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminOrders.detail(id)
  }

  @Patch(':id/status')
  @Header('Cache-Control', 'no-store')
  changeStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: OrderStatusChangeDto,
    @CurrentAdmin() admin: AdminProfile | undefined,
  ) {
    return this.adminOrders.changeStatus(id, dto, admin?.id ?? null)
  }

  @Patch(':id/tracking')
  @Header('Cache-Control', 'no-store')
  updateTracking(@Param('id', ParseUUIDPipe) id: string, @Body() dto: OrderTrackingDto) {
    return this.adminOrders.updateTracking(id, dto)
  }

  @Patch(':id/notes')
  @Header('Cache-Control', 'no-store')
  updateNotes(@Param('id', ParseUUIDPipe) id: string, @Body() dto: OrderNotesDto) {
    return this.adminOrders.updateNotes(id, dto)
  }

  @Patch(':id/cash-collected')
  @Header('Cache-Control', 'no-store')
  cashCollected(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAdmin() admin: AdminProfile | undefined,
  ) {
    return this.adminOrders.markCashCollected(id, admin?.id ?? null)
  }
}
