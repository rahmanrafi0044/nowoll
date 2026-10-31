import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common'
import type { AdminProfile } from '../admin-auth/admin-auth.service.js'
import { AdminOnly } from '../common/decorators/admin-only.decorator.js'
import { CurrentAdmin } from '../common/guards/admin.guard.js'
import { AdminOrdersService } from './admin-orders.service.js'
import {
  AdminOrdersQuery,
  BookCourierDto,
  NotDeliveredDto,
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

  /** The spec's invoice route — data for the printable page (see AdminOrdersService.invoice). */
  @Get(':id/invoice')
  @Header('Cache-Control', 'no-store')
  invoice(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminOrders.invoice(id)
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

  /** Phase 2: "Book with Steadfast" — books the parcel and marks the order shipped. */
  @Post(':id/courier')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  bookCourier(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: BookCourierDto,
    @CurrentAdmin() admin: AdminProfile | undefined,
  ) {
    return this.adminOrders.bookCourier(id, dto.from, admin?.id ?? null)
  }

  /** "Parcel came back (not delivered)" — stock back, order cancelled, no email. */
  @Post(':id/not-delivered')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  notDelivered(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: NotDeliveredDto,
    @CurrentAdmin() admin: AdminProfile | undefined,
  ) {
    return this.adminOrders.markNotDelivered(id, dto, admin?.id ?? null)
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
