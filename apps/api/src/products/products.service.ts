import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common'
import { Prisma, type Product } from '@nowoll/database'
import { InventoryChangeReason, ProductStatus } from '@nowoll/database/enums'
import type { Paginated } from '@nowoll/types'
import { CategoriesService } from '../categories/categories.service.js'
import { StockService } from '../inventory/stock.service.js'
import { pickUniqueSlug, slugPrefixOf } from '../common/slugs.js'
import { compareSizes } from './size-order.js'
import { PrismaService } from '../prisma/prisma.service.js'
import type { CreateProductDto } from './dto/create-product.dto.js'
import type { CreateVariantDto } from './dto/create-variant.dto.js'
import type { ListProductsQuery } from './dto/list-products.query.js'
import type { UpdateProductDto } from './dto/update-product.dto.js'
import {
  distinctColors,
  distinctSizes,
  fromPrice,
  type ProductBadges,
  productBadges,
  type PublicImage,
  type PublicVariant,
  toPublicImage,
  toPublicVariant,
} from './product-view.js'
import { RedirectsService } from '../redirects/redirects.service.js'
import { SettingsService } from '../settings/settings.service.js'

/** Photos per card: the first, the hover one, and a few for swiping on phones. */
const CARD_IMAGES = 4
/** "New"/"Restocked" for this many days when Admin → Settings can't be read (hand-built tests). */
const DEFAULT_BADGE_DAYS = 14

const FALLBACK_SLUG = 'product'

/** Prices arrive as JSON numbers; store them as exact decimals ("1499.50"). */
export const toDecimal = (n: number) => new Prisma.Decimal(n.toFixed(2))
const toDecimalOrNull = (n: number | null | undefined) =>
  n === undefined ? undefined : n === null ? null : toDecimal(n)

// Only these variant/image rows are ever shown or counted.
const LIVE_VARIANT = { isActive: true, deletedAt: null } satisfies Prisma.ProductVariantWhereInput

export interface ProductCard {
  id: string
  name: string
  slug: string
  shortDescription: string | null
  basePrice: Prisma.Decimal
  compareAtPrice: Prisma.Decimal | null
  isFeatured: boolean
  category: { name: string; slug: string }
  image: PublicImage | null
  /** Up to 4 photos: [0] = image, [1] = shown on hover, all = swipe on phones (38f). */
  images: PublicImage[]
  colors: { color: string; colorHex: string | null }[]
  sizes: string[]
  inStock: boolean
  fabric: string | null
  /** The lowest price when the variants' prices differ ("From ৳…"), else null. */
  fromPrice: Prisma.Decimal | null
  badges: ProductBadges
}

export interface ProductDetail extends Omit<ProductCard, 'image' | 'images' | 'colors' | 'sizes'> {
  description: string | null
  care: string | null
  fitNote: string | null
  tags: string[]
  seoTitle: string | null
  seoDescription: string | null
  breadcrumb: { id: string; name: string; slug: string }[]
  images: PublicImage[]
  variants: PublicVariant[]
}

export interface ProductFacets {
  sizes: string[]
  colors: { color: string; colorHex: string | null }[]
  price: { min: Prisma.Decimal; max: Prisma.Decimal } | null
}

// Shared "include" for loading what a card or detail page needs in ONE query.
const PUBLIC_INCLUDE = {
  category: { select: { id: true, name: true, slug: true } },
  variants: { where: LIVE_VARIANT, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
  images: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
} satisfies Prisma.ProductInclude

type ProductWithRelations = Prisma.ProductGetPayload<{ include: typeof PUBLIC_INCLUDE }>

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly categories: CategoriesService,
    private readonly stock: StockService,
    // Step 43c: old address → new one when the slug changes (optional for hand-built tests).
    @Optional() private readonly redirects?: RedirectsService,
    // 38f: how long "New"/"Restocked" badges show (optional for hand-built tests).
    @Optional() private readonly settings?: SettingsService,
  ) {}

  /** Admin → Settings → badge days, read once per request. */
  private async badgeDays(): Promise<number> {
    return this.settings ? (await this.settings.all()).badge_days : DEFAULT_BADGE_DAYS
  }

  // ── Public ─────────────────────────────────────────────────────────────

  /** GET /products — one page of product cards, filtered, searched and sorted. */
  async list(query: ListProductsQuery): Promise<Paginated<ProductCard>> {
    const { page, pageSize } = query
    const empty: Paginated<ProductCard> = { items: [], total: 0, page, pageSize, totalPages: 0 }

    const visibleCategoryIds = query.category
      ? await this.categories.visibleSubtreeIds(query.category)
      : [...(await this.categories.visibleCategoryIds())]
    if (!visibleCategoryIds || visibleCategoryIds.length === 0) return empty

    // Search ranks come from Postgres full-text search (see the product_search migration).
    const ranks = query.q ? await this.searchRanks(query.q) : null
    if (ranks && ranks.size === 0) return empty

    const where: Prisma.ProductWhereInput = {
      status: ProductStatus.ACTIVE,
      deletedAt: null,
      categoryId: { in: visibleCategoryIds },
      ...(ranks && { id: { in: [...ranks.keys()] } }),
      ...(query.featured !== undefined && { isFeatured: query.featured }),
      ...(query.tag && { tags: { has: query.tag } }),
      ...((query.minPrice !== undefined || query.maxPrice !== undefined) && {
        // Filters on the "from" price (decision #6)
        basePrice: {
          ...(query.minPrice !== undefined && { gte: query.minPrice }),
          ...(query.maxPrice !== undefined && { lte: query.maxPrice }),
        },
      }),
      // Size, color and in-stock must all be true for the SAME variant:
      // "M in Blue, in stock" — not "has an M" + "has something blue".
      ...((query.size || query.color || query.inStock) && {
        variants: {
          some: {
            ...LIVE_VARIANT,
            ...(query.size && { size: { equals: query.size, mode: 'insensitive' } }),
            ...(query.color && { color: { equals: query.color, mode: 'insensitive' } }),
            ...(query.inStock && { stock: { gt: 0 } }),
          },
        },
      }),
    }

    const sort = query.sort ?? (ranks ? 'relevance' : 'newest')
    const total = await this.prisma.product.count({ where })
    if (total === 0) return empty

    let rows: ProductWithRelations[]
    if (sort === 'relevance' && ranks) {
      // Relevance order lives in `ranks`, not in a column, so: get every
      // matching id, sort by rank here, then load just this page.
      // Fine for a clothing catalog (hundreds–low thousands of products).
      const ids = (await this.prisma.product.findMany({ where, select: { id: true } }))
        .map((p) => p.id)
        .sort((a, b) => (ranks.get(b) ?? 0) - (ranks.get(a) ?? 0))
        .slice((page - 1) * pageSize, page * pageSize)
      const loaded = await this.prisma.product.findMany({
        where: { id: { in: ids } },
        include: PUBLIC_INCLUDE,
      })
      const byId = new Map(loaded.map((p) => [p.id, p]))
      rows = ids.map((id) => byId.get(id)).filter((p) => p !== undefined)
    } else {
      rows = await this.prisma.product.findMany({
        where,
        include: PUBLIC_INCLUDE,
        orderBy:
          sort === 'price_asc'
            ? [{ basePrice: 'asc' }, { id: 'asc' }]
            : sort === 'price_desc'
              ? [{ basePrice: 'desc' }, { id: 'asc' }]
              : [{ createdAt: 'desc' }, { id: 'asc' }], // id = stable tie-breaker for paging
        skip: (page - 1) * pageSize,
        take: pageSize,
      })
    }

    const badgeDays = await this.badgeDays()
    return {
      items: rows.map((p) => this.toCard(p, badgeDays)),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    }
  }

  /**
   * GET /products/facets — the filter options for a listing page: which sizes,
   * colors and price range exist among the visible products of a category
   * (and/or search). Deliberately IGNORES the size/color/price filters
   * themselves, so choosing "M" doesn't make the other sizes disappear.
   */
  async facets(query: { category?: string; q?: string }): Promise<ProductFacets> {
    const empty: ProductFacets = { sizes: [], colors: [], price: null }
    const visibleCategoryIds = query.category
      ? await this.categories.visibleSubtreeIds(query.category)
      : [...(await this.categories.visibleCategoryIds())]
    if (!visibleCategoryIds || visibleCategoryIds.length === 0) return empty
    const ranks = query.q ? await this.searchRanks(query.q) : null
    if (ranks && ranks.size === 0) return empty

    const productWhere: Prisma.ProductWhereInput = {
      status: ProductStatus.ACTIVE,
      deletedAt: null,
      categoryId: { in: visibleCategoryIds },
      ...(ranks && { id: { in: [...ranks.keys()] } }),
    }
    const [variants, price] = await Promise.all([
      this.prisma.productVariant.findMany({
        where: { ...LIVE_VARIANT, product: productWhere },
        select: { size: true, color: true, colorHex: true },
        distinct: ['size', 'color'],
      }),
      this.prisma.product.aggregate({
        where: productWhere,
        _min: { basePrice: true },
        _max: { basePrice: true },
      }),
    ])

    return {
      sizes: [...new Set(variants.map((v) => v.size))].sort(compareSizes),
      colors: distinctColors(variants).sort((a, b) => a.color.localeCompare(b.color)),
      price:
        price._min.basePrice && price._max.basePrice
          ? { min: price._min.basePrice, max: price._max.basePrice }
          : null,
    }
  }

  /** GET /products/:slug — everything the product page needs. */
  /**
   * GET /products/:slug — or null when customers can't see it (draft,
   * archived, hidden category, unknown). null (200), not 404: Next.js only
   * caches 200 answers, so a 404 would keep an archived product's page
   * showing on the shop (step 36 lesson).
   */
  async findBySlug(slug: string): Promise<ProductDetail | null> {
    let product: ProductWithRelations
    try {
      product = await this.findVisible({ slug })
    } catch (error) {
      if (error instanceof NotFoundException) return null
      throw error
    }
    const {
      images: _cardImages,
      colors: _c,
      sizes: _s,
      image: _i,
      ...card
    } = this.toCard(product, await this.badgeDays())
    return {
      ...card,
      description: product.description,
      care: product.care,
      fitNote: product.fitNote,
      tags: product.tags,
      seoTitle: product.seoTitle,
      seoDescription: product.seoDescription,
      breadcrumb: await this.categories.breadcrumbFor(product.categoryId),
      images: product.images.map(toPublicImage),
      variants: product.variants.map((v) => toPublicVariant(v, product)),
    }
  }

  /**
   * A product a customer may see, with its live variants and images.
   * Draft, archived and hidden-category products all 404 — customers can't
   * tell them apart from products that never existed.
   */
  async findVisible(where: { slug: string } | { id: string }): Promise<ProductWithRelations> {
    const product = await this.prisma.product.findFirst({
      where: { ...where, status: ProductStatus.ACTIVE, deletedAt: null },
      include: PUBLIC_INCLUDE,
    })
    const visibleCategoryIds = await this.categories.visibleCategoryIds()
    if (!product || !visibleCategoryIds.has(product.categoryId)) {
      throw new NotFoundException('Product not found')
    }
    return product
  }

  // ── Admin ──────────────────────────────────────────────────────────────

  async create(dto: CreateProductDto): Promise<Product> {
    const { variants = [], ...fields } = dto
    await this.assertCategoryUsable(fields.categoryId)
    assertCompareAtAbove(fields.basePrice, fields.compareAtPrice)
    assertNoDuplicateVariants(variants)
    for (const v of variants) assertCompareAtAbove(v.price ?? fields.basePrice, v.compareAtPrice)
    await this.assertSkusAvailable(variants.map((v) => v.sku))

    const slug = fields.slug
      ? await this.assertSlugAvailable(fields.slug)
      : await this.generateUniqueSlug(fields.name)

    // TRANSACTION: the product, its variants and their starting stock (with
    // its log entries) are saved together — or, if anything fails, not at all.
    return this.prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          ...fields,
          slug,
          basePrice: toDecimal(fields.basePrice),
          compareAtPrice: toDecimalOrNull(fields.compareAtPrice),
          status: ProductStatus.DRAFT,
          // Without an explicit sortOrder, keep the order the admin listed them in
          // (otherwise all would be 0 with identical timestamps → random order).
          variants: {
            create: variants.map((v, i) => variantData({ ...v, sortOrder: v.sortOrder ?? i })),
          },
        },
        include: { variants: true },
      })
      await addStartingStock(this.stock, tx, product.variants, variants)
      return tx.product.findUniqueOrThrow({
        where: { id: product.id },
        include: { variants: true },
      })
    })
  }

  async update(id: string, dto: UpdateProductDto): Promise<Product> {
    const existing = await this.findAdminOrThrow(id)

    if (dto.categoryId) await this.assertCategoryUsable(dto.categoryId)
    assertCompareAtAbove(
      dto.basePrice ?? existing.basePrice.toNumber(),
      dto.compareAtPrice === undefined ? existing.compareAtPrice?.toNumber() : dto.compareAtPrice,
    )
    // Like categories: renaming keeps the slug so shared links keep working.
    if (dto.slug && dto.slug !== existing.slug) await this.assertSlugAvailable(dto.slug)
    if (dto.status === ProductStatus.ACTIVE) await assertPublishable(this.prisma, id)

    const updated = await this.prisma.product.update({
      where: { id },
      data: {
        ...dto,
        basePrice: dto.basePrice === undefined ? undefined : toDecimal(dto.basePrice),
        compareAtPrice: toDecimalOrNull(dto.compareAtPrice),
      },
    })
    // New address → the old one keeps working (step 43c).
    if (updated.slug !== existing.slug)
      await this.redirects?.moved(`/products/${existing.slug}`, `/products/${updated.slug}`)
    return updated
  }

  /** Soft delete: hidden everywhere, but kept for order history and old links. */
  async remove(id: string): Promise<{ id: string }> {
    await this.findAdminOrThrow(id)
    await this.prisma.product.update({
      where: { id },
      data: { status: ProductStatus.ARCHIVED, deletedAt: new Date(), isFeatured: false },
    })
    return { id }
  }

  /**
   * Product cards for these ids, in that order — only products the shop shows
   * (active, not deleted, in a visible category; the same rule as the list).
   * Used by blog posts' "Shop the look" (step 43): a hidden product just drops out.
   */
  async cardsByIds(ids: string[]): Promise<ProductCard[]> {
    if (ids.length === 0) return []
    const visible = [...(await this.categories.visibleCategoryIds())]
    const rows = await this.prisma.product.findMany({
      where: {
        id: { in: ids },
        status: ProductStatus.ACTIVE,
        deletedAt: null,
        categoryId: { in: visible },
      },
      include: PUBLIC_INCLUDE,
    })
    const byId = new Map(rows.map((r) => [r.id, r]))
    const badgeDays = await this.badgeDays()
    return ids.flatMap((id) => {
      const row = byId.get(id)
      return row ? [this.toCard(row, badgeDays)] : []
    })
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  private toCard(p: ProductWithRelations, badgeDays: number): ProductCard {
    const firstImage = p.images[0]
    const inStock = p.variants.some((v) => v.stock > 0)
    return {
      id: p.id,
      name: p.name,
      slug: p.slug,
      shortDescription: p.shortDescription,
      basePrice: p.basePrice,
      compareAtPrice: p.compareAtPrice,
      isFeatured: p.isFeatured,
      category: { name: p.category.name, slug: p.category.slug },
      image: firstImage ? toPublicImage(firstImage) : null,
      images: p.images.slice(0, CARD_IMAGES).map(toPublicImage),
      colors: distinctColors(p.variants),
      sizes: distinctSizes(p.variants),
      inStock,
      fabric: p.fabric,
      fromPrice: fromPrice(p.variants, p.basePrice),
      badges: productBadges(p, inStock, badgeDays),
    }
  }

  /** Product ids matching the search words, with a relevance score each. */
  private async searchRanks(q: string): Promise<Map<string, number>> {
    // websearch_to_tsquery understands what people type into search boxes:
    // plain words, "exact phrases" and -excluded words. It never throws on odd input.
    // $queryRaw with ${q} sends q as a PARAMETER, so this is safe from SQL injection.
    const rows = await this.prisma.$queryRaw<{ id: string; rank: number }[]>`
      SELECT id::text AS id, ts_rank(search_vector, websearch_to_tsquery('english', ${q}))::float8 AS rank
      FROM products
      WHERE search_vector @@ websearch_to_tsquery('english', ${q})
        AND deleted_at IS NULL AND status = 'ACTIVE'`
    return new Map(rows.map((r) => [r.id, r.rank]))
  }

  private async findAdminOrThrow(id: string): Promise<Product> {
    const product = await this.prisma.product.findFirst({ where: { id, deletedAt: null } })
    if (!product) throw new NotFoundException('Product not found')
    return product
  }

  private async assertCategoryUsable(categoryId: string): Promise<void> {
    const category = await this.prisma.category.findFirst({
      where: { id: categoryId, deletedAt: null },
    })
    if (!category) throw new BadRequestException('Category not found.')
  }

  private async assertSlugAvailable(slug: string): Promise<string> {
    const taken = await this.prisma.product.findUnique({
      where: { slug },
      select: { deletedAt: true },
    })
    if (taken) {
      throw new ConflictException(
        taken.deletedAt
          ? `The slug "${slug}" belongs to an archived product. Choose another.`
          : `The slug "${slug}" is already in use. Choose another.`,
      )
    }
    return slug
  }

  async assertSkusAvailable(skus: string[]): Promise<void> {
    if (skus.length === 0) return
    const taken = await this.prisma.productVariant.findMany({
      where: { sku: { in: skus } },
      select: { sku: true },
    })
    if (taken.length > 0) {
      throw new ConflictException(`SKU already in use: ${taken.map((t) => t.sku).join(', ')}`)
    }
  }

  private async generateUniqueSlug(name: string): Promise<string> {
    const existing = await this.prisma.product.findMany({
      where: { slug: { startsWith: slugPrefixOf(name, FALLBACK_SLUG) } },
      select: { slug: true },
    })
    return pickUniqueSlug(name, new Set(existing.map((p) => p.slug)), FALLBACK_SLUG)
  }
}

// ── Rules shared with VariantsService and the CSV importer ──────────────────

/**
 * DTO → database row for a new variant. Stock always starts at 0: the
 * requested starting stock is then added through StockService (see
 * addStartingStock), so it's logged like every other stock change.
 */
export function variantData(v: CreateVariantDto) {
  const { stock: _starting, ...rest } = v
  return {
    ...rest,
    stock: 0,
    price: toDecimalOrNull(v.price),
    compareAtPrice: toDecimalOrNull(v.compareAtPrice),
  }
}

/** A "was ৳X" price must be higher than the selling price, or it's misleading. */
export function assertCompareAtAbove(price: number, compareAt: number | null | undefined): void {
  if (compareAt !== null && compareAt !== undefined && compareAt <= price) {
    throw new BadRequestException(
      `compareAtPrice (${compareAt}) must be higher than the selling price (${price}).`,
    )
  }
}

/** Two variants with the same size AND color in one request is always a mistake. */
export function assertNoDuplicateVariants(
  variants: Pick<CreateVariantDto, 'sku' | 'size' | 'color'>[],
): void {
  const combos = new Set<string>()
  const skus = new Set<string>()
  for (const v of variants) {
    const combo = `${v.size.toLowerCase()} / ${v.color.toLowerCase()}`
    if (combos.has(combo))
      throw new BadRequestException(`Duplicate variant: ${v.size} / ${v.color}`)
    if (skus.has(v.sku)) throw new BadRequestException(`Duplicate SKU in request: ${v.sku}`)
    combos.add(combo)
    skus.add(v.sku)
  }
}

/** Gives freshly created variants their requested starting stock (logged as INITIAL_STOCK). */
export async function addStartingStock(
  stock: StockService,
  tx: Prisma.TransactionClient,
  created: { id: string; sku: string }[],
  requested: Pick<CreateVariantDto, 'sku' | 'stock'>[],
): Promise<void> {
  for (const r of requested) {
    if (!r.stock) continue
    const variant = created.find((c) => c.sku === r.sku)
    if (!variant) continue
    await stock.adjust(tx, {
      variantId: variant.id,
      adjustment: { change: r.stock },
      reason: InventoryChangeReason.INITIAL_STOCK,
    })
  }
}

/**
 * PUBLISHING RULE (decision #3): an ACTIVE product needs at least one live
 * variant AND at least one image, so customers never see a product with no
 * photo or nothing to buy. Checked when publishing, and after removing a
 * variant or image from a product that is already ACTIVE.
 */
export async function assertPublishable(
  db: Prisma.TransactionClient | PrismaService,
  productId: string,
): Promise<void> {
  const [variants, images] = await Promise.all([
    db.productVariant.count({ where: { productId, ...LIVE_VARIANT } }),
    db.productImage.count({ where: { productId } }),
  ])
  const missing = [variants === 0 && 'an active variant', images === 0 && 'an image'].filter(
    Boolean,
  )
  if (missing.length > 0) {
    throw new ConflictException(
      `A published product needs ${missing.join(' and ')}. Add it first, or set the product back to DRAFT.`,
    )
  }
}
