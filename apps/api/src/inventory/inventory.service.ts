import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import type { Prisma } from '@nowoll/database'
import { InventoryChangeReason, ProductStatus } from '@nowoll/database/enums'
import type { Paginated } from '@nowoll/types'
import { PrismaService } from '../prisma/prisma.service.js'
import { SettingsService } from '../settings/settings.service.js'
import type { AdjustStockDto } from './dto/adjust-stock.dto.js'
import type { ListInventoryQuery, PageQuery } from './dto/list-inventory.query.js'
import { type StockChange, StockService } from './stock.service.js'

export interface InventoryRow {
  variantId: string
  sku: string
  size: string
  color: string
  stock: number
  threshold: number // the variant's own, or the store-wide setting
  usesStoreThreshold: boolean
  isLow: boolean
  isActive: boolean
  product: { id: string; name: string; slug: string; status: string }
  category: { name: string; slug: string }
}

const ROW_INCLUDE = {
  product: {
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      category: { select: { name: true, slug: true } },
    },
  },
} satisfies Prisma.ProductVariantInclude

type VariantWithProduct = Prisma.ProductVariantGetPayload<{ include: typeof ROW_INCLUDE }>

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stock: StockService,
    private readonly settings: SettingsService,
  ) {}

  /** GET /inventory — every live variant (drafts and inactive included). */
  async list(query: ListInventoryQuery): Promise<Paginated<InventoryRow>> {
    const where: Prisma.ProductVariantWhereInput = {
      deletedAt: null,
      product: {
        deletedAt: null,
        ...(query.category && { category: { slug: query.category } }),
      },
      ...(query.stock === 'out' && { stock: 0 }),
      ...(query.q && {
        OR: [
          { sku: { contains: query.q, mode: 'insensitive' } },
          { product: { name: { contains: query.q, mode: 'insensitive' } } },
        ],
      }),
    }
    const orderBy: Prisma.ProductVariantOrderByWithRelationInput[] =
      query.sort === 'name'
        ? [{ product: { name: 'asc' } }, { sortOrder: 'asc' }]
        : [
            { stock: query.sort === 'stock_desc' ? 'desc' : 'asc' },
            { product: { name: 'asc' } },
            { sku: 'asc' },
          ]

    const [total, variants, storeThreshold] = await Promise.all([
      this.prisma.productVariant.count({ where }),
      this.prisma.productVariant.findMany({
        where,
        include: ROW_INCLUDE,
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.settings.lowStockThreshold(),
    ])
    return {
      items: variants.map((v) => toRow(v, storeThreshold)),
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.ceil(total / query.pageSize),
    }
  }

  /**
   * GET /inventory/low-stock — active variants of published products at or
   * below their threshold, lowest stock first.
   * The "own threshold, else store threshold" comparison is between two
   * columns/values, which Prisma's query builder can't express — so the ids
   * come from a small SQL query (values passed as parameters, never pasted in).
   */
  async lowStock(): Promise<{ items: InventoryRow[]; total: number; threshold: number }> {
    const storeThreshold = await this.settings.lowStockThreshold()
    const ids = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT v.id::text AS id
      FROM product_variants v
      JOIN products p ON p.id = v.product_id
      WHERE v.deleted_at IS NULL AND v.is_active
        AND p.deleted_at IS NULL AND p.status = ${ProductStatus.ACTIVE}::"ProductStatus"
        AND v.stock <= COALESCE(v.low_stock_threshold, ${storeThreshold})
      ORDER BY v.stock ASC, p.name ASC, v.sku ASC
      LIMIT 1000`

    const variants = await this.prisma.productVariant.findMany({
      where: { id: { in: ids.map((r) => r.id) } },
      include: ROW_INCLUDE,
    })
    const byId = new Map(variants.map((v) => [v.id, v]))
    const items = ids
      .map((r) => byId.get(r.id))
      .filter((v) => v !== undefined)
      .map((v) => toRow(v, storeThreshold))
    return { items, total: items.length, threshold: storeThreshold }
  }

  /** PATCH /inventory/:variantId/adjust — a manual change, always logged with a note. */
  async adjust(variantId: string, dto: AdjustStockDto): Promise<Omit<StockChange, 'alert'>> {
    if (dto.change !== undefined && dto.setTo !== undefined) {
      throw new BadRequestException('Send either change or setTo, not both.')
    }
    const adjustment = dto.change !== undefined ? { change: dto.change } : { setTo: dto.setTo! }

    const result = await this.prisma.$transaction((tx) =>
      this.stock.adjust(tx, {
        variantId,
        adjustment,
        reason: InventoryChangeReason.MANUAL_ADJUSTMENT,
        note: dto.note,
      }),
    )
    await this.stock.notifyLowStock([result]) // after commit — see StockService
    const { alert: _alert, ...change } = result
    return change
  }

  /** GET /inventory/:variantId/log — newest first. Works for archived variants too (history is history). */
  async history(variantId: string, query: PageQuery) {
    const variant = await this.prisma.productVariant.findUnique({
      where: { id: variantId },
      select: { id: true },
    })
    if (!variant) throw new NotFoundException('Variant not found')

    const where = { variantId }
    const [total, logs] = await Promise.all([
      this.prisma.inventoryLog.count({ where }),
      this.prisma.inventoryLog.findMany({
        where,
        include: { actor: { select: { id: true, fullName: true, email: true } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ])
    return {
      items: logs.map((l) => ({
        id: l.id,
        change: l.change,
        stockAfter: l.stockAfter,
        reason: l.reason,
        note: l.note,
        orderId: l.orderId,
        actor: l.actor,
        createdAt: l.createdAt,
      })),
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.ceil(total / query.pageSize),
    }
  }
}

function toRow(v: VariantWithProduct, storeThreshold: number): InventoryRow {
  const threshold = v.lowStockThreshold ?? storeThreshold
  return {
    variantId: v.id,
    sku: v.sku,
    size: v.size,
    color: v.color,
    stock: v.stock,
    threshold,
    usesStoreThreshold: v.lowStockThreshold === null,
    isLow: v.stock <= threshold,
    isActive: v.isActive,
    product: {
      id: v.product.id,
      name: v.product.name,
      slug: v.product.slug,
      status: v.product.status,
    },
    category: v.product.category,
  }
}
