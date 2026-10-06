import { HttpException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { Prisma } from '@nowoll/database'
import { ProductStatus } from '@nowoll/database/enums'
import type {
  AdminProductList,
  AdminProductRow,
  BulkProductAction,
  BulkProductResult,
} from '@nowoll/types'
import { PrismaService } from '../prisma/prisma.service.js'
import { SettingsService } from '../settings/settings.service.js'
import type { AdminProductsQuery } from './dto/admin-products.dto.js'
import type { UpdateProductDto } from './dto/update-product.dto.js'
import { ProductsService } from './products.service.js'

// ============================================================================
// The ADMIN view of the catalog (step 30a). The shop's routes only ever show
// live products; this one shows everything — drafts, archived, exact stock —
// and is admin-only (staff + 2FA).
//
// Bulk actions REUSE ProductsService.update / remove one product at a time,
// so every rule (e.g. "a live product needs a variant and an image") applies
// exactly as on the edit page. Each product succeeds or fails on its own.
// ============================================================================

const LIVE_VARIANT = { isActive: true, deletedAt: null } satisfies Prisma.ProductVariantWhereInput

const ROW_INCLUDE = {
  category: { select: { id: true, name: true } },
  variants: { where: LIVE_VARIANT, select: { stock: true, lowStockThreshold: true } },
  images: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }], take: 1 },
  _count: { select: { images: true } },
} satisfies Prisma.ProductInclude

type Row = Prisma.ProductGetPayload<{ include: typeof ROW_INCLUDE }>

@Injectable()
export class AdminProductsService {
  private readonly logger = new Logger(AdminProductsService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly products: ProductsService,
    private readonly settings: SettingsService,
  ) {}

  /** GET /admin/products */
  async list(query: AdminProductsQuery): Promise<AdminProductList> {
    const { page, pageSize } = query
    const threshold = await this.settings.lowStockThreshold()
    const lowStockIds = query.lowStock ? await this.lowStockProductIds(threshold) : null

    const q = query.q
    const where: Prisma.ProductWhereInput = {
      ...statusFilter(query.status),
      ...(query.categoryId && { categoryId: query.categoryId }),
      ...(lowStockIds && { id: { in: lowStockIds } }),
      ...(q && {
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { slug: { contains: q, mode: 'insensitive' } },
          { variants: { some: { deletedAt: null, sku: { contains: q, mode: 'insensitive' } } } },
        ],
      }),
    }
    const [total, rows] = await Promise.all([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        include: ROW_INCLUDE,
        orderBy: ORDER[query.sort],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ])
    return {
      items: rows.map((p) => toRow(p, threshold)),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    }
  }

  /** POST /admin/products/bulk */
  async bulk(action: BulkProductAction, ids: string[]): Promise<BulkProductResult> {
    const names = new Map(
      (
        await this.prisma.product.findMany({
          where: { id: { in: ids } },
          select: { id: true, name: true },
        })
      ).map((p) => [p.id, p.name]),
    )
    const result: BulkProductResult = { action, succeeded: [], failed: [] }
    // One at a time, on purpose: each product gets the normal checks, and one
    // product failing (e.g. no photo yet) never blocks the others.
    for (const id of ids) {
      try {
        await this.apply(action, id)
        result.succeeded.push(id)
      } catch (error) {
        result.failed.push({ id, name: names.get(id) ?? null, reason: this.reasonOf(error) })
      }
    }
    return result
  }

  private apply(action: BulkProductAction, id: string): Promise<unknown> {
    const update = (dto: UpdateProductDto) => this.products.update(id, dto)
    switch (action) {
      case 'publish':
        return update({ status: ProductStatus.ACTIVE })
      case 'unpublish':
        return update({ status: ProductStatus.DRAFT })
      case 'feature':
        return update({ isFeatured: true })
      case 'unfeature':
        return update({ isFeatured: false })
      case 'archive':
        return this.products.remove(id)
    }
  }

  private reasonOf(error: unknown): string {
    if (error instanceof NotFoundException) return 'Not found — it may already be archived.'
    if (error instanceof HttpException) {
      const res = error.getResponse()
      const message = typeof res === 'string' ? res : (res as { message?: unknown }).message
      return typeof message === 'string' ? message : error.message
    }
    this.logger.error(`Bulk action failed unexpectedly: ${String(error)}`)
    return 'Something went wrong with this one. Please try it again.'
  }

  /** Products with at least one live variant at or below its limit (own, or the store-wide one). */
  private async lowStockProductIds(threshold: number): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT DISTINCT v.product_id::text AS id
      FROM product_variants v
      WHERE v.deleted_at IS NULL AND v.is_active
        AND v.stock <= COALESCE(v.low_stock_threshold, ${threshold})`
    return rows.map((r) => r.id)
  }
}

function statusFilter(status: AdminProductsQuery['status']): Prisma.ProductWhereInput {
  if (status === 'all') return {}
  if (status === 'ARCHIVED') return { status: ProductStatus.ARCHIVED }
  if (status) return { status, deletedAt: null }
  return { status: { in: [ProductStatus.DRAFT, ProductStatus.ACTIVE] }, deletedAt: null }
}

// `id` last in every order: a stable tie-breaker, so paging never repeats or skips a row.
const ORDER: Record<AdminProductsQuery['sort'], Prisma.ProductOrderByWithRelationInput[]> = {
  updated: [{ updatedAt: 'desc' }, { id: 'asc' }],
  newest: [{ createdAt: 'desc' }, { id: 'asc' }],
  name: [{ name: 'asc' }, { id: 'asc' }],
  price_asc: [{ basePrice: 'asc' }, { id: 'asc' }],
  price_desc: [{ basePrice: 'desc' }, { id: 'asc' }],
}

function toRow(p: Row, threshold: number): AdminProductRow {
  const image = p.images[0]
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    status: p.status,
    isFeatured: p.isFeatured,
    category: p.category,
    basePrice: p.basePrice.toString(),
    compareAtPrice: p.compareAtPrice?.toString() ?? null,
    image: image ? { url: image.url, altText: image.altText } : null,
    imageCount: p._count.images,
    variantCount: p.variants.length,
    totalStock: p.variants.reduce((n, v) => n + v.stock, 0),
    lowStockVariants: p.variants.filter((v) => v.stock <= (v.lowStockThreshold ?? threshold))
      .length,
    publishable: p.variants.length > 0 && p._count.images > 0,
    updatedAt: p.updatedAt.toISOString(),
  }
}
