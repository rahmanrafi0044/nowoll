import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { AdminOnly } from '../common/decorators/admin-only.decorator.js'
import { MAX_IMAGE_BYTES } from '../storage/image-storage.js'
import { CreateProductDto } from './dto/create-product.dto.js'
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
  ) {}

  @Get()
  list(@Query() query: ListProductsQuery) {
    return this.products.list(query)
  }

  // NOTE: fixed paths like /products/export (commit 4) must be declared ABOVE
  // this route — NestJS matches routes in order, and ':slug' matches anything.
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
