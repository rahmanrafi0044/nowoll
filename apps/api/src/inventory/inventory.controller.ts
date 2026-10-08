import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common'
import type { AdminProfile } from '../admin-auth/admin-auth.service.js'
import { AdminOnly } from '../common/decorators/admin-only.decorator.js'
import { CurrentAdmin } from '../common/guards/admin.guard.js'
import { AdjustStockDto } from './dto/adjust-stock.dto.js'
import { ListInventoryQuery, PageQuery } from './dto/list-inventory.query.js'
import { InventoryService } from './inventory.service.js'

// Routes from the spec's route map. Every inventory route is admin-only.
@Controller('inventory')
@AdminOnly()
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get()
  list(@Query() query: ListInventoryQuery) {
    return this.inventory.list(query)
  }

  @Get('low-stock')
  lowStock() {
    return this.inventory.lowStock()
  }

  @Patch(':variantId/adjust')
  adjust(
    @Param('variantId', ParseUUIDPipe) variantId: string,
    @Body() dto: AdjustStockDto,
    @CurrentAdmin() admin: AdminProfile | undefined,
  ) {
    return this.inventory.adjust(variantId, dto, admin?.id ?? null)
  }

  @Get(':variantId/log')
  history(@Param('variantId', ParseUUIDPipe) variantId: string, @Query() query: PageQuery) {
    return this.inventory.history(variantId, query)
  }
}
