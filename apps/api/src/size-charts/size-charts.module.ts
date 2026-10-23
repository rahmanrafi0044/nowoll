import { Global, Module } from '@nestjs/common'
import { AdminSizeChartsController } from './size-charts.controller.js'
import { SizeChartsService } from './size-charts.service.js'

// Size charts (38f). @Global: products and categories check a chart exists
// before linking to it.
@Global()
@Module({
  controllers: [AdminSizeChartsController],
  providers: [SizeChartsService],
  exports: [SizeChartsService],
})
export class SizeChartsModule {}
