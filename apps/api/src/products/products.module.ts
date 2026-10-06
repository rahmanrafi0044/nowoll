import { Module } from '@nestjs/common'
import { CategoriesModule } from '../categories/categories.module.js'
import { InventoryModule } from '../inventory/inventory.module.js'
import { SettingsModule } from '../settings/settings.module.js'
import { AdminProductsController } from './admin-products.controller.js'
import { AdminProductsService } from './admin-products.service.js'
import { CsvExportService } from './csv/csv-export.service.js'
import { CsvImportService } from './csv/csv-import.service.js'
import { ImagesService } from './images/images.service.js'
import { ProductsController } from './products.controller.js'
import { ProductsService } from './products.service.js'
import { VariantsController } from './variants.controller.js'
import { VariantsService } from './variants.service.js'

@Module({
  // Categories: visible-category lookups and breadcrumbs. Inventory: StockService.
  // Settings: the low-stock limit shown in the admin product list.
  imports: [CategoriesModule, InventoryModule, SettingsModule],
  controllers: [ProductsController, VariantsController, AdminProductsController],
  providers: [
    ProductsService,
    VariantsService,
    ImagesService,
    CsvExportService,
    CsvImportService,
    AdminProductsService,
  ],
  exports: [ProductsService],
})
export class ProductsModule {}
