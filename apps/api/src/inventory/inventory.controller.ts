import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common'
import { AdminOnly } from '../common/decorators/admin-only.decorator.js'
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
  adjust(@Param('variantId', ParseUUIDPipe) variantId: string, @Body() dto: AdjustStockDto) {
    return this.inventory.adjust(variantId, dto)
  }

  @Get(':variantId/log')
  history(@Param('variantId', ParseUUIDPipe) variantId: string, @Query() query: PageQuery) {
    return this.inventory.history(variantId, query)
  }
}
