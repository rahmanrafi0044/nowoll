import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { ProductStatus } from '@nowoll/database/enums'
import { stringify } from 'csv-stringify/sync'
import { CategoriesService } from '../categories/categories.service.js'
import type { EnvironmentVariables } from '../config/env.validation.js'
import { PrismaService } from '../prisma/prisma.service.js'
import { SettingsService } from '../settings/settings.service.js'
import { CATALOG_COLUMNS, catalogRows, type SkippedProduct } from './catalog-rows.js'

/** Built at most this often — Meta fetches hourly; a few thousand rows take a moment. */
const CACHE_MS = 10 * 60 * 1000

export interface BuiltFeed {
  csv: string
  items: number
  skipped: SkippedProduct[]
  builtAt: Date
}

// The Meta catalogue feed (step 39c, docs/integrations/meta.md → Catalog feed).
// Lists EXACTLY what the shop shows: active, not deleted, in a visible
// category, and only the sizes/colours on sale.
@Injectable()
export class CatalogFeedService {
  private cache: BuiltFeed | null = null

  constructor(
    private readonly prisma: PrismaService,
    private readonly categories: CategoriesService,
    private readonly settings: SettingsService,
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  /** The CSV for Meta — or null when the feed is switched off (the address then answers 404). */
  async feed(now = Date.now()): Promise<string | null> {
    const s = await this.settings.all()
    if (!s.meta_catalog_enabled) return null
    return (await this.built(now)).csv
  }

  /** For Admin → Marketing: on/off, the address, how many items, which products were left out. */
  async report() {
    const s = await this.settings.all()
    const built = await this.built(Date.now(), true)
    const api = this.config.get('API_PUBLIC_URL', { infer: true }).replace(/\/+$/, '')
    return {
      enabled: s.meta_catalog_enabled,
      url: `${api}/api/v1/feeds/meta-catalog.csv`,
      items: built.items,
      skipped: built.skipped,
      builtAt: built.builtAt,
    }
  }

  private async built(now: number, fresh = false): Promise<BuiltFeed> {
    if (!fresh && this.cache && now - this.cache.builtAt.getTime() < CACHE_MS) return this.cache
    const [s, visible] = await Promise.all([
      this.settings.all(),
      this.categories.visibleCategoryIds(),
    ])
    const products = await this.prisma.product.findMany({
      where: { status: ProductStatus.ACTIVE, deletedAt: null, categoryId: { in: [...visible] } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        slug: true,
        shortDescription: true,
        description: true,
        categoryId: true,
        basePrice: true,
        compareAtPrice: true,
        variants: {
          where: { isActive: true, deletedAt: null },
          orderBy: { sortOrder: 'asc' },
          select: {
            id: true,
            sku: true,
            size: true,
            color: true,
            colorHex: true,
            price: true,
            compareAtPrice: true,
            stock: true,
            sortOrder: true,
          },
        },
        images: { select: { url: true, variantId: true, sortOrder: true } },
      },
    })
    // Category paths, once per category (not once per product).
    const paths = new Map<string, string>()
    for (const id of new Set(products.map((p) => p.categoryId)))
      paths.set(id, (await this.categories.breadcrumbFor(id)).map((c) => c.name).join(' > '))

    const { rows, skipped } = catalogRows(products, {
      siteUrl: this.config.get('NEXT_PUBLIC_SITE_URL', { infer: true }),
      brand: s.store_name,
      categoryPath: (id) => paths.get(id) ?? '',
    })
    const csv = stringify(rows, {
      header: true,
      columns: [...CATALOG_COLUMNS],
      // Belt and braces: text fields are already cleaned of leading = + - @ (catalog-rows.ts).
      escape_formulas: true,
    })
    this.cache = { csv, items: rows.length, skipped, builtAt: new Date(now) }
    return this.cache
  }
}
