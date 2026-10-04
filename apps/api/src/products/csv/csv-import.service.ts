import { BadRequestException, Injectable } from '@nestjs/common'
import { Prisma } from '@nowoll/database'
import { InventoryChangeReason, ProductStatus } from '@nowoll/database/enums'
import { bdtAmountSchema, SLUG_PATTERN } from '@nowoll/validation'
import { CsvError, parse } from 'csv-parse/sync'
import { PrismaService } from '../../prisma/prisma.service.js'
import { assertPublishable, toDecimal } from '../products.service.js'
import {
  CSV_COLUMNS,
  type CsvColumn,
  MAX_IMPORT_ROWS,
  PRODUCT_COLUMNS,
  unescapeFormula,
} from './csv-format.js'

// ============================================================================
// CSV IMPORT — all-or-nothing (decision #2).
//
//   1. PARSE     bytes → rows of text
//   2. VALIDATE  every row against the rules AND the current database, building
//                a plan of exactly what will change. Collect ALL problems.
//   3. APPLY     the plan in ONE transaction — or, for a dry run, just report it.
//
// Column rules (so a spreadsheet can't accidentally wipe data):
//   • A column missing from the file → that field is never touched.
//   • A blank cell in an optional field (description, compare_at_price…) clears it.
//   • A blank cell in a required field (name, price, size…) leaves it unchanged.
//   • Rows are matched by product_slug and sku. Import never deletes anything.
// ============================================================================

export interface ImportSummary {
  dryRun: boolean
  products: { created: number; updated: number; unchanged: number }
  variants: { created: number; updated: number; unchanged: number }
  stockChanges: number
}

type Row = { line: number; cells: Partial<Record<CsvColumn, string>> }

interface ProductFields {
  name?: string
  categoryId?: string
  status?: typeof ProductStatus.DRAFT | typeof ProductStatus.ACTIVE
  basePrice?: number
  compareAtPrice?: number | null
  shortDescription?: string | null
  description?: string | null
  tags?: string[]
  isFeatured?: boolean
  seoTitle?: string | null
  seoDescription?: string | null
}

interface VariantFields {
  size?: string
  color?: string
  colorHex?: string | null
  price?: number | null
  compareAtPrice?: number | null
  lowStockThreshold?: number | null
  weightGrams?: number | null
  isActive?: boolean
}

interface VariantPlan {
  sku: string
  existingId?: string
  restore: boolean // an archived variant comes back
  fields: VariantFields // only fields that actually change
  stock?: number // new absolute stock, only if it changes
}

interface ProductPlan {
  slug: string
  existingId?: string
  fields: ProductFields // only fields that actually change (all given fields for new products)
  finalStatus: string
  variants: VariantPlan[]
}

// ── Cell readers: text → typed value, or an error message ──────────────────

type Read<T> = { ok: true; value: T } | { ok: false; error: string }
const ok = <T>(value: T): Read<T> => ({ ok: true, value })
const fail = <T>(error: string): Read<T> => ({ ok: false, error })

function readText(raw: string, max: number): Read<string | null> {
  if (raw === '') return ok(null)
  return raw.length > max ? fail(`must be at most ${max} characters`) : ok(raw)
}

function readMoney(raw: string, { positive }: { positive: boolean }): Read<number | null> {
  if (raw === '') return ok(null)
  const parsed = bdtAmountSchema.safeParse(raw) // the SAME money rule the frontend forms use
  if (!parsed.success) return fail(`"${raw}" is not a valid amount (use e.g. 1499 or 1499.50)`)
  if (positive && parsed.data <= 0) return fail('must be greater than 0')
  return ok(parsed.data)
}

function readInt(raw: string, min: number, max: number): Read<number | null> {
  if (raw === '') return ok(null)
  if (!/^\d+$/.test(raw)) return fail(`"${raw}" is not a whole number`)
  const n = Number(raw)
  return n < min || n > max ? fail(`must be between ${min} and ${max}`) : ok(n)
}

function readBool(raw: string): Read<boolean | null> {
  if (raw === '') return ok(null)
  const v = raw.toLowerCase()
  if (['true', 'yes', '1'].includes(v)) return ok(true)
  if (['false', 'no', '0'].includes(v)) return ok(false)
  return fail(`"${raw}" must be true or false`)
}

function readTags(raw: string): Read<string[]> {
  const tags = [
    ...new Set(
      raw
        .split('|')
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean),
    ),
  ]
  if (tags.length > 20) return fail('at most 20 tags')
  const tooLong = tags.find((t) => t.length > 30)
  return tooLong ? fail(`tag "${tooLong}" is longer than 30 characters`) : ok(tags)
}

const sameMoney = (a: Prisma.Decimal | null, b: number | null) =>
  a === null || b === null ? a === b : a.toFixed(2) === b.toFixed(2)

@Injectable()
export class CsvImportService {
  constructor(private readonly prisma: PrismaService) {}

  async importProducts(file: Buffer, options: { dryRun: boolean }): Promise<ImportSummary> {
    const rows = this.parse(file)
    const { plans, errors } = await this.validate(rows)

    if (errors.length > 0) {
      const shown = errors.slice(0, 100)
      if (errors.length > shown.length) shown.push(`…and ${errors.length - shown.length} more`)
      throw new BadRequestException({
        message: `Import rejected: ${errors.length} problem${errors.length === 1 ? '' : 's'} found. Nothing was saved.`,
        details: shown,
      })
    }

    const summary = summarize(plans, options.dryRun)
    if (!options.dryRun) await this.apply(plans)
    return summary
  }

  // ── 1. Parse ─────────────────────────────────────────────────────────────

  private parse(file: Buffer): Row[] {
    if (file.length === 0) throw new BadRequestException('The CSV file is empty.')
    if (file.includes(0)) throw new BadRequestException('This is not a CSV text file.')

    let records: Record<string, string>[]
    try {
      records = parse(file, {
        bom: true, // files saved by Excel start with a byte-order mark
        columns: (header: string[]) => header.map((h) => h.trim().toLowerCase()),
        skip_empty_lines: true,
        trim: true,
        to: MAX_IMPORT_ROWS + 1, // read one extra row so "too many rows" is detectable
      })
    } catch (error) {
      const detail = error instanceof CsvError ? error.message : String(error)
      throw new BadRequestException(`The CSV file could not be read: ${detail}`)
    }

    if (records.length === 0)
      throw new BadRequestException('The CSV file has a header but no rows.')
    if (records.length > MAX_IMPORT_ROWS) {
      throw new BadRequestException(`At most ${MAX_IMPORT_ROWS} rows per import. Split the file.`)
    }

    const headers = Object.keys(records[0]!)
    const unknown = headers.filter((h) => !(CSV_COLUMNS as readonly string[]).includes(h))
    if (unknown.length > 0) {
      throw new BadRequestException({
        message: 'The CSV has columns Nowoll does not recognise (check for typos).',
        details: unknown.map((h) => `Unknown column: "${h}"`),
      })
    }
    if (!headers.includes('product_slug')) {
      throw new BadRequestException('The CSV must have a product_slug column.')
    }

    return records.map((record, i) => ({
      line: i + 2, // row 1 is the header — these match the row numbers in Excel
      cells: Object.fromEntries(
        Object.entries(record).map(([k, v]) => [k, unescapeFormula(v)]),
      ) as Row['cells'],
    }))
  }

  // ── 2. Validate & plan ───────────────────────────────────────────────────

  private async validate(rows: Row[]): Promise<{ plans: ProductPlan[]; errors: string[] }> {
    const errors: string[] = []
    const err = (line: number, column: string, message: string) =>
      errors.push(`Row ${line}${column ? `, ${column}` : ''}: ${message}`)
    const has = (column: CsvColumn) => column in rows[0]!.cells

    // Load everything the rules need in a few queries (a "snapshot").
    const slugs = [...new Set(rows.map((r) => r.cells.product_slug ?? ''))]
    const skus = [...new Set(rows.map((r) => r.cells.sku ?? '').filter(Boolean))]
    const [categories, products, variantsBySkuList] = await Promise.all([
      this.prisma.category.findMany({
        where: { deletedAt: null },
        select: { id: true, slug: true },
      }),
      this.prisma.product.findMany({
        where: { slug: { in: slugs } },
        include: { variants: true, _count: { select: { images: true } } },
      }),
      this.prisma.productVariant.findMany({
        where: { sku: { in: skus } },
        select: { sku: true, productId: true },
      }),
    ])
    const categoryIdBySlug = new Map(categories.map((c) => [c.slug, c.id]))
    const productBySlug = new Map(products.map((p) => [p.slug, p]))
    const productIdBySku = new Map(variantsBySkuList.map((v) => [v.sku, v.productId]))

    // Group rows by product.
    const groups = new Map<string, Row[]>()
    for (const row of rows) {
      const slug = row.cells.product_slug ?? ''
      if (!slug) {
        err(row.line, 'product_slug', 'is required')
        continue
      }
      if (!SLUG_PATTERN.test(slug)) {
        err(
          row.line,
          'product_slug',
          `"${slug}" is not a valid slug (lowercase letters, numbers, hyphens)`,
        )
        continue
      }
      groups.set(slug, [...(groups.get(slug) ?? []), row])
    }

    const seenSkus = new Map<string, number>() // sku → first line
    const plans: ProductPlan[] = []

    for (const [slug, group] of groups) {
      const first = group[0]!
      const existing = productBySlug.get(slug)
      if (existing?.deletedAt) {
        err(
          first.line,
          'product_slug',
          `"${slug}" belongs to an archived product — use a different slug`,
        )
        continue
      }

      // Product columns must be identical on every row of the same product.
      for (const row of group.slice(1)) {
        const differing = PRODUCT_COLUMNS.filter(
          (c) => has(c) && (row.cells[c] ?? '') !== (first.cells[c] ?? ''),
        )
        if (differing.length > 0) {
          err(
            row.line,
            differing.join(', '),
            `must match row ${first.line} (same product "${slug}")`,
          )
        }
      }

      // ── Product fields ──
      const given: ProductFields = {}
      const read = <T>(column: CsvColumn, result: Read<T>, apply: (v: T) => void) => {
        if (!has(column)) return
        if (result.ok) apply(result.value)
        else err(first.line, column, result.error)
      }
      const c = first.cells
      read(
        'product_name',
        readText(c.product_name ?? '', 150),
        (v) => v !== null && (given.name = v),
      )
      read('category_slug', ok(c.category_slug ?? ''), (v) => {
        if (!v) return
        const id = categoryIdBySlug.get(v)
        if (id) given.categoryId = id
        else err(first.line, 'category_slug', `no category "${v}"`)
      })
      read('status', ok(c.status ?? ''), (v) => {
        if (!v) return
        const s = v.toUpperCase()
        if (s === 'DRAFT' || s === 'ACTIVE') given.status = s
        else
          err(
            first.line,
            'status',
            `"${v}" must be DRAFT or ACTIVE (archive products in the admin panel)`,
          )
      })
      read(
        'base_price',
        readMoney(c.base_price ?? '', { positive: true }),
        (v) => v !== null && (given.basePrice = v),
      )
      read(
        'compare_at_price',
        readMoney(c.compare_at_price ?? '', { positive: true }),
        (v) => (given.compareAtPrice = v),
      )
      read(
        'short_description',
        readText(c.short_description ?? '', 300),
        (v) => (given.shortDescription = v),
      )
      read('description', readText(c.description ?? '', 10000), (v) => (given.description = v))
      read('tags', readTags(c.tags ?? ''), (v) => (given.tags = v))
      read(
        'is_featured',
        readBool(c.is_featured ?? ''),
        (v) => v !== null && (given.isFeatured = v),
      )
      read('seo_title', readText(c.seo_title ?? '', 70), (v) => (given.seoTitle = v))
      read(
        'seo_description',
        readText(c.seo_description ?? '', 160),
        (v) => (given.seoDescription = v),
      )

      if (!existing) {
        for (const [field, column] of [
          ['name', 'product_name'],
          ['categoryId', 'category_slug'],
          ['basePrice', 'base_price'],
        ] as const) {
          if (
            given[field] === undefined &&
            !errors.some((e) => e.startsWith(`Row ${first.line}, ${column}`))
          ) {
            err(first.line, column, `is required for a new product ("${slug}")`)
          }
        }
      }

      const basePrice = given.basePrice ?? existing?.basePrice.toNumber() ?? 0
      const compareAt =
        given.compareAtPrice !== undefined
          ? given.compareAtPrice
          : (existing?.compareAtPrice?.toNumber() ?? null)
      if (compareAt !== null && compareAt <= basePrice) {
        err(
          first.line,
          'compare_at_price',
          `${compareAt} must be higher than base_price ${basePrice}`,
        )
      }

      // ── Variants ──
      const variantPlans: VariantPlan[] = []
      const liveVariants = new Map(
        (existing?.variants ?? []).filter((v) => !v.deletedAt).map((v) => [v.id, v]),
      )
      const finalVariants = new Map(
        [...liveVariants.values()].map((v) => [
          v.id as string,
          { size: v.size, color: v.color, isActive: v.isActive },
        ]),
      )

      for (const row of group) {
        const sku = row.cells.sku ?? ''
        if (!sku) continue // product-only row
        if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(sku)) {
          err(
            row.line,
            'sku',
            `"${sku}" may only contain letters, numbers, dots, dashes and underscores (max 64)`,
          )
          continue
        }
        const earlier = seenSkus.get(sku)
        if (earlier !== undefined) {
          err(row.line, 'sku', `"${sku}" appears more than once (also row ${earlier})`)
          continue
        }
        seenSkus.set(sku, row.line)

        const owner = productIdBySku.get(sku)
        if (owner && owner !== existing?.id) {
          err(row.line, 'sku', `"${sku}" already belongs to another product`)
          continue
        }
        const current = existing?.variants.find((v) => v.sku === sku)

        const vf: VariantFields = {}
        const v = row.cells
        const readV = <T>(column: CsvColumn, result: Read<T>, apply: (x: T) => void) => {
          if (!has(column)) return
          if (result.ok) apply(result.value)
          else err(row.line, column, result.error)
        }
        readV('size', readText(v.size ?? '', 30), (x) => x !== null && (vf.size = x))
        readV('color', readText(v.color ?? '', 40), (x) => x !== null && (vf.color = x))
        readV('color_hex', ok(v.color_hex ?? ''), (x) => {
          if (x === '') vf.colorHex = null
          else if (/^#[0-9A-Fa-f]{6}$/.test(x)) vf.colorHex = x.toUpperCase()
          else err(row.line, 'color_hex', `"${x}" must look like #1E3A8A`)
        })
        readV(
          'variant_price',
          readMoney(v.variant_price ?? '', { positive: true }),
          (x) => (vf.price = x),
        )
        readV(
          'variant_compare_at_price',
          readMoney(v.variant_compare_at_price ?? '', { positive: true }),
          (x) => (vf.compareAtPrice = x),
        )
        readV(
          'low_stock_threshold',
          readInt(v.low_stock_threshold ?? '', 0, 100_000),
          (x) => (vf.lowStockThreshold = x),
        )
        readV(
          'weight_grams',
          readInt(v.weight_grams ?? '', 1, 100_000),
          (x) => (vf.weightGrams = x),
        )
        readV(
          'variant_active',
          readBool(v.variant_active ?? ''),
          (x) => x !== null && (vf.isActive = x),
        )
        let stock: number | undefined
        readV('stock', readInt(v.stock ?? '', 0, 1_000_000), (x) => x !== null && (stock = x))

        const size = vf.size ?? current?.size
        const color = vf.color ?? current?.color
        if (!size || !color) {
          err(row.line, !size ? 'size' : 'color', `is required for a new variant ("${sku}")`)
          continue
        }

        const price = vf.price !== undefined ? vf.price : (current?.price?.toNumber() ?? null)
        const vCompare =
          vf.compareAtPrice !== undefined
            ? vf.compareAtPrice
            : (current?.compareAtPrice?.toNumber() ?? null)
        if (vCompare !== null && vCompare <= (price ?? basePrice)) {
          err(
            row.line,
            'variant_compare_at_price',
            `${vCompare} must be higher than the selling price ${price ?? basePrice}`,
          )
        }

        // Same size + color twice in one product?
        const key = current?.id ?? `new:${sku}`
        const clash = [...finalVariants.entries()].find(
          ([id, f]) =>
            id !== key &&
            f.size.toLowerCase() === size.toLowerCase() &&
            f.color.toLowerCase() === color.toLowerCase(),
        )
        if (clash) {
          err(row.line, 'size, color', `"${slug}" already has a ${size} / ${color} variant`)
          continue
        }
        finalVariants.set(key, { size, color, isActive: vf.isActive ?? current?.isActive ?? true })

        // Keep only real changes (so re-importing an export reports 0 updates).
        const changed: VariantFields = {}
        if (!current) Object.assign(changed, vf)
        else {
          if (vf.size !== undefined && vf.size !== current.size) changed.size = vf.size
          if (vf.color !== undefined && vf.color !== current.color) changed.color = vf.color
          if (vf.colorHex !== undefined && vf.colorHex !== current.colorHex)
            changed.colorHex = vf.colorHex
          if (vf.price !== undefined && !sameMoney(current.price, vf.price))
            changed.price = vf.price
          if (
            vf.compareAtPrice !== undefined &&
            !sameMoney(current.compareAtPrice, vf.compareAtPrice)
          )
            changed.compareAtPrice = vf.compareAtPrice
          if (
            vf.lowStockThreshold !== undefined &&
            vf.lowStockThreshold !== current.lowStockThreshold
          )
            changed.lowStockThreshold = vf.lowStockThreshold
          if (vf.weightGrams !== undefined && vf.weightGrams !== current.weightGrams)
            changed.weightGrams = vf.weightGrams
          if (vf.isActive !== undefined && vf.isActive !== current.isActive)
            changed.isActive = vf.isActive
        }
        variantPlans.push({
          sku,
          existingId: current?.id,
          restore: Boolean(current?.deletedAt),
          fields: changed,
          stock: current
            ? stock !== undefined && stock !== current.stock
              ? stock
              : undefined
            : stock,
        })
      }

      // ── Publishing rule on the final state ──
      const finalStatus = given.status ?? existing?.status ?? ProductStatus.DRAFT
      if (finalStatus === ProductStatus.ACTIVE) {
        const activeVariants = [...finalVariants.values()].filter((f) => f.isActive).length
        const images = existing?._count.images ?? 0
        if (activeVariants === 0 || images === 0) {
          const missing = [
            activeVariants === 0 && 'an active variant',
            images === 0 && 'an image',
          ].filter(Boolean)
          err(
            first.line,
            'status',
            `"${slug}" can't be ACTIVE: it needs ${missing.join(' and ')} (upload images in the admin panel, then publish)`,
          )
        }
      }

      // Product-level changes only
      const productChanges: ProductFields = {}
      if (!existing) Object.assign(productChanges, given)
      else {
        if (given.name !== undefined && given.name !== existing.name)
          productChanges.name = given.name
        if (given.categoryId !== undefined && given.categoryId !== existing.categoryId)
          productChanges.categoryId = given.categoryId
        if (given.status !== undefined && given.status !== existing.status)
          productChanges.status = given.status
        if (given.basePrice !== undefined && !sameMoney(existing.basePrice, given.basePrice))
          productChanges.basePrice = given.basePrice
        if (
          given.compareAtPrice !== undefined &&
          !sameMoney(existing.compareAtPrice, given.compareAtPrice)
        )
          productChanges.compareAtPrice = given.compareAtPrice
        for (const f of [
          'shortDescription',
          'description',
          'seoTitle',
          'seoDescription',
        ] as const) {
          if (given[f] !== undefined && given[f] !== existing[f]) productChanges[f] = given[f]
        }
        if (given.tags !== undefined && given.tags.join('|') !== existing.tags.join('|'))
          productChanges.tags = given.tags
        if (given.isFeatured !== undefined && given.isFeatured !== existing.isFeatured)
          productChanges.isFeatured = given.isFeatured
      }

      plans.push({
        slug,
        existingId: existing?.id,
        fields: productChanges,
        finalStatus,
        variants: variantPlans,
      })
    }

    return { plans, errors }
  }

  // ── 3. Apply (one transaction) ───────────────────────────────────────────

  private async apply(plans: ProductPlan[]): Promise<void> {
    await this.prisma.$transaction(
      async (tx) => {
        for (const plan of plans) {
          const { basePrice, compareAtPrice, ...rest } = plan.fields
          const money = {
            ...(basePrice !== undefined && { basePrice: toDecimal(basePrice) }),
            ...(compareAtPrice !== undefined && {
              compareAtPrice: compareAtPrice === null ? null : toDecimal(compareAtPrice),
            }),
          }

          let productId = plan.existingId
          if (!productId) {
            const created = await tx.product.create({
              data: {
                ...rest,
                ...money,
                slug: plan.slug,
                name: rest.name!,
                categoryId: rest.categoryId!,
                basePrice: toDecimal(basePrice!),
                status: rest.status ?? ProductStatus.DRAFT,
              },
            })
            productId = created.id
          } else if (Object.keys(plan.fields).length > 0) {
            await tx.product.update({ where: { id: productId }, data: { ...rest, ...money } })
          }

          let nextSort =
            ((
              await tx.productVariant.aggregate({ where: { productId }, _max: { sortOrder: true } })
            )._max.sortOrder ?? -1) + 1

          for (const v of plan.variants) {
            const { price, compareAtPrice: vCompare, ...vRest } = v.fields
            const vMoney = {
              ...(price !== undefined && { price: price === null ? null : toDecimal(price) }),
              ...(vCompare !== undefined && {
                compareAtPrice: vCompare === null ? null : toDecimal(vCompare),
              }),
            }

            if (!v.existingId) {
              const created = await tx.productVariant.create({
                data: {
                  ...vRest,
                  ...vMoney,
                  productId,
                  sku: v.sku,
                  size: vRest.size!,
                  color: vRest.color!,
                  stock: v.stock ?? 0,
                  sortOrder: nextSort++,
                },
              })
              if (created.stock > 0) {
                await tx.inventoryLog.create({
                  data: {
                    variantId: created.id,
                    change: created.stock,
                    stockAfter: created.stock,
                    reason: InventoryChangeReason.CSV_IMPORT,
                  },
                })
              }
              continue
            }

            if (Object.keys(v.fields).length > 0 || v.restore) {
              await tx.productVariant.update({
                where: { id: v.existingId },
                data: { ...vRest, ...vMoney, ...(v.restore && { deletedAt: null }) },
              })
            }
            if (v.stock !== undefined) {
              // Lock the row and read the stock INSIDE the transaction, so the
              // logged change is exact even if an order happens at the same time.
              const locked = await tx.$queryRaw<{ stock: number }[]>`
                SELECT stock FROM product_variants WHERE id = ${v.existingId}::uuid FOR UPDATE`
              const before = locked[0]?.stock ?? 0
              if (before !== v.stock) {
                await tx.productVariant.update({
                  where: { id: v.existingId },
                  data: { stock: v.stock },
                })
                await tx.inventoryLog.create({
                  data: {
                    variantId: v.existingId,
                    change: v.stock - before,
                    stockAfter: v.stock,
                    reason: InventoryChangeReason.CSV_IMPORT,
                    // TODO(phase 4): actorId = the signed-in admin
                  },
                })
              }
            }
          }

          // Safety net: re-check the publishing rule on the real final state.
          if (plan.finalStatus === ProductStatus.ACTIVE) await assertPublishable(tx, productId)
        }
      },
      { timeout: 60_000, maxWait: 10_000 }, // large files take longer than the 5s default
    )
  }
}

function summarize(plans: ProductPlan[], dryRun: boolean): ImportSummary {
  const s: ImportSummary = {
    dryRun,
    products: { created: 0, updated: 0, unchanged: 0 },
    variants: { created: 0, updated: 0, unchanged: 0 },
    stockChanges: 0,
  }
  for (const p of plans) {
    if (!p.existingId) s.products.created++
    else if (Object.keys(p.fields).length > 0) s.products.updated++
    else s.products.unchanged++
    for (const v of p.variants) {
      if (!v.existingId) s.variants.created++
      else if (Object.keys(v.fields).length > 0 || v.restore || v.stock !== undefined)
        s.variants.updated++
      else s.variants.unchanged++
      if (v.stock !== undefined && (v.existingId || v.stock > 0)) s.stockChanges++
    }
  }
  return s
}
