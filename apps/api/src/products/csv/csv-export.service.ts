import { Injectable } from '@nestjs/common'
import type { Prisma } from '@nowoll/database'
import { stringify } from 'csv-stringify/sync'
import { PrismaService } from '../../prisma/prisma.service.js'
import { CSV_COLUMNS, type CsvColumn, VARIANT_COLUMNS } from './csv-format.js'

const money = (d: Prisma.Decimal | null) => (d === null ? '' : d.toFixed(2))
const num = (n: number | null) => (n === null ? '' : String(n))

@Injectable()
export class CsvExportService {
  constructor(private readonly prisma: PrismaService) {}

  /** Every non-archived product (drafts included) and its live variants, as CSV bytes. */
  async exportProducts(): Promise<Buffer> {
    const products = await this.prisma.product.findMany({
      where: { deletedAt: null },
      include: {
        category: { select: { slug: true } },
        variants: {
          where: { deletedAt: null },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    })

    const rows: Record<CsvColumn, string>[] = []
    for (const p of products) {
      const productCells = {
        product_slug: p.slug,
        product_name: p.name,
        category_slug: p.category.slug,
        status: p.status,
        base_price: money(p.basePrice),
        compare_at_price: money(p.compareAtPrice),
        short_description: p.shortDescription ?? '',
        description: p.description ?? '',
        tags: p.tags.join('|'),
        is_featured: String(p.isFeatured),
        seo_title: p.seoTitle ?? '',
        seo_description: p.seoDescription ?? '',
      }
      const emptyVariant = Object.fromEntries(VARIANT_COLUMNS.map((c) => [c, ''])) as Record<
        (typeof VARIANT_COLUMNS)[number],
        string
      >

      if (p.variants.length === 0) rows.push({ ...emptyVariant, ...productCells })
      for (const v of p.variants) {
        rows.push({
          ...productCells,
          sku: v.sku,
          size: v.size,
          color: v.color,
          color_hex: v.colorHex ?? '',
          variant_price: money(v.price),
          variant_compare_at_price: money(v.compareAtPrice),
          stock: String(v.stock),
          low_stock_threshold: num(v.lowStockThreshold),
          weight_grams: num(v.weightGrams),
          variant_active: String(v.isActive),
        })
      }
    }

    return Buffer.from(
      stringify(rows, {
        header: true,
        columns: [...CSV_COLUMNS],
        // CSV INJECTION protection: cells starting with = + - @ get a leading '
        // so spreadsheet apps show them as text instead of running a formula.
        escape_formulas: true,
        // Byte-order mark: makes Excel open the file as UTF-8, so Bangla text
        // and the ৳ sign display correctly instead of as garbled characters.
        bom: true,
      }),
    )
  }
}
