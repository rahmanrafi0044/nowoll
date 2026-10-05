import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { AdminOnly } from '../common/decorators/admin-only.decorator.js'
import { MAX_IMAGE_BYTES } from '../storage/image-storage.js'
import { CsvExportService } from './csv/csv-export.service.js'
import { MAX_IMPORT_BYTES } from './csv/csv-format.js'
import { CsvImportService } from './csv/csv-import.service.js'
import { CreateProductDto } from './dto/create-product.dto.js'
import { FacetsQuery } from './dto/facets.query.js'
import { ImportProductsQuery } from './dto/import-products.query.js'
import { ListProductsQuery } from './dto/list-products.query.js'
import { UpdateImageDto } from './dto/update-image.dto.js'
import { UpdateProductDto } from './dto/update-product.dto.js'
import { UploadImageDto } from './dto/upload-image.dto.js'
import { ImagesService, type UploadedImageFile } from './images/images.service.js'
import { ProductsService } from './products.service.js'

@Controller('products')
export class ProductsController {
  constructor(
    private readonly products: ProductsService,
    private readonly images: ImagesService,
    private readonly csvExport: CsvExportService,
    private readonly csvImport: CsvImportService,
  ) {}

  @Get()
  list(@Query() query: ListProductsQuery) {
    return this.products.list(query)
  }

  /** Filter options (sizes, colors, price range) for a listing page. Declared before ':slug'. */
  @Get('facets')
  facets(@Query() query: FacetsQuery) {
    return this.products.facets(query)
  }

  // ── CSV (declared BEFORE ':slug' — NestJS matches routes in order, and
  //    ':slug' would otherwise treat "export" as a product slug) ──

  /** Downloads every non-archived product + variant as a spreadsheet-ready CSV. */
  @Get('export')
  @AdminOnly()
  async exportCsv() {
    const date = new Date().toISOString().slice(0, 10)
    return new StreamableFile(await this.csvExport.exportProducts(), {
      type: 'text/csv; charset=utf-8',
      disposition: `attachment; filename="nowoll-products-${date}.csv"`,
    })
  }

  /** Creates/updates products from a CSV. ?dryRun=true checks the file without saving. */
  @Post('import')
  @AdminOnly()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_IMPORT_BYTES, files: 1 } }))
  importCsv(
    @UploadedFile() file: { buffer: Buffer } | undefined,
    @Query() query: ImportProductsQuery,
  ) {
    if (!file) throw new BadRequestException('Attach a CSV file in the "file" field.')
    return this.csvImport.importProducts(file.buffer, { dryRun: query.dryRun ?? false })
  }

  @Get(':slug')
  findBySlug(@Param('slug') slug: string) {
    return this.products.findBySlug(slug)
  }

  @Post()
  @AdminOnly()
  create(@Body() dto: CreateProductDto) {
    return this.products.create(dto)
  }

  @Patch(':id')
  @AdminOnly()
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateProductDto) {
    return this.products.update(id, dto)
  }

  @Delete(':id')
  @AdminOnly()
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.products.remove(id)
  }

  // ── Images (multipart/form-data: "file" + altText, variantId?, sortOrder?) ──

  // FileInterceptor reads the upload into memory. Multer stops reading at 5 MB
  // and Nest answers 413 Payload Too Large — the server never holds a huge file.
  @Post(':id/images')
  @AdminOnly()
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_IMAGE_BYTES, files: 1, fields: 10 } }),
  )
  uploadImage(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: UploadedImageFile | undefined,
    @Body() dto: UploadImageDto,
  ) {
    return this.images.upload(id, file, dto)
  }

  @Patch(':id/images/:imageId')
  @AdminOnly()
  updateImage(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('imageId', ParseUUIDPipe) imageId: string,
    @Body() dto: UpdateImageDto,
  ) {
    return this.images.update(id, imageId, dto)
  }

  @Delete(':id/images/:imageId')
  @AdminOnly()
  removeImage(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('imageId', ParseUUIDPipe) imageId: string,
  ) {
    return this.images.remove(id, imageId)
  }
}
