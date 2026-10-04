import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import type { ProductVariant } from '@nowoll/database'
import { InventoryChangeReason, ProductStatus } from '@nowoll/database/enums'
import { StockService } from '../inventory/stock.service.js'
import { PrismaService } from '../prisma/prisma.service.js'
import type { CreateVariantDto } from './dto/create-variant.dto.js'
import type { UpdateVariantDto } from './dto/update-variant.dto.js'
import { type PublicVariant, toPublicVariant } from './product-view.js'
import {
  addStartingStock,
  assertCompareAtAbove,
  assertPublishable,
  ProductsService,
  toDecimal,
  variantData,
} from './products.service.js'

@Injectable()
export class VariantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly products: ProductsService,
    private readonly stock: StockService,
  ) {}

  /** GET /variants/product/:productId — live variants of a visible product. */
  async listForProduct(productId: string): Promise<PublicVariant[]> {
    const product = await this.products.findVisible({ id: productId })
    return product.variants.map((v) => toPublicVariant(v, product))
  }

  async create(productId: string, dto: CreateVariantDto): Promise<ProductVariant> {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, deletedAt: null },
    })
    if (!product) throw new NotFoundException('Product not found')
    assertCompareAtAbove(dto.price ?? product.basePrice.toNumber(), dto.compareAtPrice)

    const sameCombo = await this.prisma.productVariant.findFirst({
      where: {
        productId,
        size: { equals: dto.size, mode: 'insensitive' },
        color: { equals: dto.color, mode: 'insensitive' },
      },
    })
    if (sameCombo && sameCombo.deletedAt === null) {
      throw new ConflictException(`This product already has a ${dto.size} / ${dto.color} variant.`)
    }

    // Re-adding a size/color that was archived earlier RESTORES that variant —
    // the database allows each size/color only once per product, archived or not.
    if (sameCombo) return this.restore(sameCombo, dto)

    await this.products.assertSkusAvailable([dto.sku])
    // New variants go to the end of the list unless a position is given.
    const last = await this.prisma.productVariant.aggregate({
      where: { productId },
      _max: { sortOrder: true },
    })
    const sortOrder = dto.sortOrder ?? (last._max.sortOrder ?? -1) + 1

    return this.prisma.$transaction(async (tx) => {
      const variant = await tx.productVariant.create({
        data: { ...variantData(dto), sortOrder, productId },
      })
      await addStartingStock(this.stock, tx, [variant], [dto])
      return tx.productVariant.findUniqueOrThrow({ where: { id: variant.id } })
    })
  }

  async update(id: string, dto: UpdateVariantDto): Promise<ProductVariant> {
    const existing = await this.findLiveOrThrow(id)
    const product = await this.prisma.product.findUniqueOrThrow({
      where: { id: existing.productId },
    })

    const size = dto.size ?? existing.size
    const color = dto.color ?? existing.color
    if (dto.size !== undefined || dto.color !== undefined) {
      const clash = await this.prisma.productVariant.findFirst({
        where: {
          productId: existing.productId,
          id: { not: id },
          size: { equals: size, mode: 'insensitive' },
          color: { equals: color, mode: 'insensitive' },
        },
      })
      if (clash)
        throw new ConflictException(`This product already has a ${size} / ${color} variant.`)
    }
    if (dto.sku && dto.sku !== existing.sku) await this.products.assertSkusAvailable([dto.sku])

    const price = dto.price === undefined ? existing.price?.toNumber() : dto.price
    const compareAt =
      dto.compareAtPrice === undefined ? existing.compareAtPrice?.toNumber() : dto.compareAtPrice
    assertCompareAtAbove(price ?? product.basePrice.toNumber(), compareAt)

    return this.prisma.$transaction(async (tx) => {
      const { price: _p, compareAtPrice: _c, ...rest } = dto
      const updated = await tx.productVariant.update({
        where: { id },
        data: {
          ...rest,
          ...(dto.price !== undefined && {
            price: dto.price === null ? null : toDecimal(dto.price),
          }),
          ...(dto.compareAtPrice !== undefined && {
            compareAtPrice: dto.compareAtPrice === null ? null : toDecimal(dto.compareAtPrice),
          }),
        },
      })
      // Deactivating the last variant of a published product is refused (rolls back).
      if (product.status === ProductStatus.ACTIVE) await assertPublishable(tx, product.id)
      return updated
    })
  }

  async remove(id: string): Promise<{ id: string }> {
    const existing = await this.findLiveOrThrow(id)
    const product = await this.prisma.product.findUniqueOrThrow({
      where: { id: existing.productId },
    })

    await this.prisma.$transaction(async (tx) => {
      await tx.productVariant.update({
        where: { id },
        data: { deletedAt: new Date(), isActive: false },
      })
      if (product.status === ProductStatus.ACTIVE) await assertPublishable(tx, product.id)
    })
    return { id }
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  private async restore(archived: ProductVariant, dto: CreateVariantDto): Promise<ProductVariant> {
    if (dto.sku !== archived.sku) await this.products.assertSkusAvailable([dto.sku])
    const { stock: _zero, ...fields } = variantData(dto) // stock is set below, with a log entry

    const { variant, change } = await this.prisma.$transaction(async (tx) => {
      await tx.productVariant.update({
        where: { id: archived.id },
        data: { ...fields, isActive: dto.isActive ?? true, deletedAt: null },
      })
      const change = await this.stock.adjust(tx, {
        variantId: archived.id,
        adjustment: { setTo: dto.stock ?? 0 },
        reason: InventoryChangeReason.MANUAL_ADJUSTMENT,
        note: 'Archived variant restored',
      })
      const variant = await tx.productVariant.findUniqueOrThrow({ where: { id: archived.id } })
      return { variant, change }
    })
    await this.stock.notifyLowStock([change])
    return variant
  }

  private async findLiveOrThrow(id: string): Promise<ProductVariant> {
    const variant = await this.prisma.productVariant.findFirst({ where: { id, deletedAt: null } })
    if (!variant) throw new NotFoundException('Variant not found')
    return variant
  }
}
