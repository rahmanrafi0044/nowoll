import { Body, Controller, Get, Header, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common'
import { AdminOnly } from '../common/decorators/admin-only.decorator.js'
import { SaveSizeChartDto } from './dto/save-size-chart.dto.js'
import { SizeChartsService } from './size-charts.service.js'

// /api/v1/admin/size-charts — Admin → Size charts (38f). Staff + Admin, like
// products. No DELETE: switch a chart off (isActive) instead. Customers get
// a chart inside the product page's data (GET /products/:slug).
@Controller('admin/size-charts')
@AdminOnly()
export class AdminSizeChartsController {
  constructor(private readonly charts: SizeChartsService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  list() {
    return this.charts.list()
  }

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.charts.get(id)
  }

  @Post()
  create(@Body() dto: SaveSizeChartDto) {
    return this.charts.create(dto)
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SaveSizeChartDto) {
    return this.charts.update(id, dto)
  }
}
