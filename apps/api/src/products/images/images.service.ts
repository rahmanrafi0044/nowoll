import { randomUUID } from 'node:crypto'
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnsupportedMediaTypeException,
} from '@nestjs/common'
import type { ProductImage } from '@nowoll/database'
import { ProductStatus } from '@nowoll/database/enums'
import { PrismaService } from '../../prisma/prisma.service.js'
import { IMAGE_STORAGE, type ImageStorage } from '../../storage/image-storage.js'
import type { UpdateImageDto } from '../dto/update-image.dto.js'
import type { UploadImageDto } from '../dto/upload-image.dto.js'
import { assertPublishable } from '../products.service.js'
import { detectImageKind, processImage } from './image-processing.js'

/** The parts of an uploaded file we use. (The original file NAME is deliberately ignored.) */
export interface UploadedImageFile {
  buffer: Buffer
}

@Injectable()
export class ImagesService {
  private readonly logger = new Logger(ImagesService.name)

  constructor(
    private readonly prisma: PrismaService,
    @Inject(IMAGE_STORAGE) private readonly storage: ImageStorage,
  ) {}

  async upload(
    productId: string,
    file: UploadedImageFile | undefined,
    dto: UploadImageDto,
  ): Promise<ProductImage> {
    if (!file || file.buffer.length === 0) {
      throw new BadRequestException('Attach an image file in the "file" field.')
    }
    await this.assertProductExists(productId)
    if (dto.variantId) await this.assertVariantBelongs(dto.variantId, productId)

    const kind = detectImageKind(file.buffer)
    if (!kind) {
      throw new UnsupportedMediaTypeException(
        'Only JPEG, PNG and WebP images are allowed. (iPhone HEIC photos: export them as JPEG first.)',
      )
    }
    const processed = await processImage(file.buffer, kind).catch(() => {
      throw new BadRequestException('This image file is damaged or could not be read.')
    })

    // SANITIZED FILENAME: we never use the uploader's file name at all — a random
    // id can't contain "../", spaces, emoji or anything else that causes trouble.
    const path = `products/${productId}/${randomUUID()}.${processed.extension}`
    await this.storage.upload(path, processed.data, processed.contentType)

    try {
      return await this.prisma.productImage.create({
        data: {
          productId,
          variantId: dto.variantId ?? null,
          url: this.storage.publicUrl(path),
          storagePath: path,
          altText: dto.altText,
          sortOrder: dto.sortOrder ?? (await this.nextSortOrder(productId)),
        },
      })
    } catch (error) {
      // COMPENSATION: the file is already in storage but the database refused
      // the row — remove the file so it doesn't sit there unused forever.
      await this.storage
        .remove([path])
        .catch((e: unknown) =>
          this.logger.warn(`Could not clean up orphaned file ${path}: ${String(e)}`),
        )
      throw error
    }
  }

  async update(productId: string, imageId: string, dto: UpdateImageDto): Promise<ProductImage> {
    await this.findOrThrow(productId, imageId)
    if (dto.variantId) await this.assertVariantBelongs(dto.variantId, productId)
    return this.prisma.productImage.update({ where: { id: imageId }, data: dto })
  }

  /**
   * Images are deleted for real (row + file), not soft-deleted: nothing else
   * refers to them, and keeping files of deleted photos would only cost storage.
   */
  async remove(productId: string, imageId: string): Promise<{ id: string }> {
    const image = await this.findOrThrow(productId, imageId)
    const product = await this.prisma.product.findUniqueOrThrow({ where: { id: productId } })

    await this.prisma.$transaction(async (tx) => {
      await tx.productImage.delete({ where: { id: imageId } })
      // Removing the last photo of a published product is refused (rolls back).
      if (product.status === ProductStatus.ACTIVE) await assertPublishable(tx, productId)
    })

    // The row is gone; if deleting the file fails, the photo is already invisible
    // to customers — log it rather than fail the admin's request.
    await this.storage
      .remove([image.storagePath])
      .catch((e: unknown) =>
        this.logger.warn(`Could not delete file ${image.storagePath}: ${String(e)}`),
      )
    return { id: imageId }
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  private async findOrThrow(productId: string, imageId: string): Promise<ProductImage> {
    const image = await this.prisma.productImage.findFirst({
      where: { id: imageId, productId, product: { deletedAt: null } },
    })
    if (!image) throw new NotFoundException('Image not found')
    return image
  }

  private async assertProductExists(productId: string): Promise<void> {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, deletedAt: null },
    })
    if (!product) throw new NotFoundException('Product not found')
  }

  private async assertVariantBelongs(variantId: string, productId: string): Promise<void> {
    const variant = await this.prisma.productVariant.findFirst({
      where: { id: variantId, productId, deletedAt: null },
    })
    if (!variant) throw new BadRequestException('variantId must be a variant of this product.')
  }

  private async nextSortOrder(productId: string): Promise<number> {
    const last = await this.prisma.productImage.aggregate({
      where: { productId },
      _max: { sortOrder: true },
    })
    return (last._max.sortOrder ?? -1) + 1
  }
}
