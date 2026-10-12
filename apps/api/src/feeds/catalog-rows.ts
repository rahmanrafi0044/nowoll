import type { Prisma } from '@nowoll/database'
import { toPublicVariant } from '../products/product-view.js'

// ============================================================================
// Meta catalogue rows (step 39c) — one row per size/colour, built from the
// same data and price rules as the product page. Field names and limits are
// Meta's (docs/integrations/meta.md → Catalog feed). Pure functions: the
// rules are tested without a database.
// ============================================================================

type Decimal = Prisma.Decimal

export const CATALOG_COLUMNS = [
  'id',
  'item_group_id',
  'title',
  'description',
  'availability',
  'condition',
  'price',
  'sale_price',
  'link',
  'image_link',
  'additional_image_link',
  'brand',
  'size',
  'color',
  'product_type',
  'status',
] as const
export type CatalogRow = Record<(typeof CATALOG_COLUMNS)[number], string>

export interface FeedProduct {
  id: string
  name: string
  slug: string
  shortDescription: string | null
  description: string | null
  categoryId: string
  basePrice: Decimal
  compareAtPrice: Decimal | null
  variants: {
    id: string
    sku: string
    size: string
    color: string
    colorHex: string | null
    price: Decimal | null
    compareAtPrice: Decimal | null
    stock: number
    sortOrder: number
  }[]
  images: { url: string; variantId: string | null; sortOrder: number }[]
}

export interface FeedContext {
  /** The shop's address, e.g. https://nowoll.com */
  siteUrl: string
  /** Store name from Settings. */
  brand: string
  /** "Men > Shirts" for a category id ('' if unknown). */
  categoryPath: (categoryId: string) => string
}

export interface SkippedProduct {
  id: string
  name: string
  slug: string
  reason: string
}

/** Meta refuses anything but JPEG and PNG photos (WebP uploads were kept as WebP before 39c). */
export const isCatalogImage = (url: string) => {
  try {
    return /\.(jpe?g|png)$/i.test(new URL(url).pathname)
  } catch {
    return false
  }
}

/**
 * Plain text, as Meta asks: no Markdown, no links, no HTML, single spaces —
 * and no leading = + - @ (a spreadsheet would read those as a formula).
 */
export function plainText(markdown: string, max: number): string {
  const text = markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '') // images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // [text](link) → text
    .replace(/<[^>]*>/g, ' ') // any HTML tag
    .replace(/https?:\/\/\S+/g, '') // bare links
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+[.)])\s+/gm, '') // headings, quotes, list markers
    .replace(/(\*\*|__|\*|_|~~|`)/g, '') // emphasis, code
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[=+\-@\s]+/, '')
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text
}

/** "1490.00 BDT" — Meta's price format. */
const metaPrice = (d: Decimal) => `${d.toFixed(2)} BDT`

/** Every live variant of a visible product → rows; products that can't be valid → skipped. */
export function catalogRows(
  products: FeedProduct[],
  ctx: FeedContext,
): { rows: CatalogRow[]; skipped: SkippedProduct[] } {
  const rows: CatalogRow[] = []
  const skipped: SkippedProduct[] = []
  const site = ctx.siteUrl.replace(/\/+$/, '')

  for (const p of products) {
    const skip = (reason: string) => skipped.push({ id: p.id, name: p.name, slug: p.slug, reason })
    const photos = [...p.images]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .filter((i) => isCatalogImage(i.url))
    if (photos.length === 0) {
      skip(
        p.images.length === 0
          ? 'No photo'
          : 'Only WebP photos — Meta needs JPEG or PNG: upload the photos again',
      )
      continue
    }
    if (p.variants.length === 0) {
      skip('No sizes/colours on sale')
      continue
    }

    const title = plainText(p.name, 200)
    const colours = [...new Set(p.variants.map((v) => v.color))]
    let description = plainText(p.shortDescription || p.description || '', 9999)
    // Meta: required, and different from the title.
    if (!description || description.toLowerCase() === title.toLowerCase())
      description = `${title} from ${ctx.brand}, in ${colours.join(', ')}.`
    const productType = plainText(ctx.categoryPath(p.categoryId), 750)
    let zeroPrice = false

    for (const raw of p.variants) {
      const v = toPublicVariant(raw, p)
      if (v.price.lessThanOrEqualTo(0)) {
        zeroPrice = true
        continue
      }
      // A higher "was" price → that's the regular price, today's is the sale price.
      const onSale = v.compareAtPrice !== null && v.compareAtPrice.greaterThan(v.price)
      // That colour's photo first (a photo linked to any size of the same colour), else the main one.
      const sameColour = new Set(p.variants.filter((x) => x.color === raw.color).map((x) => x.id))
      const main = photos.find((i) => i.variantId && sameColour.has(i.variantId)) ?? photos[0]!
      const more = photos.filter((i) => i !== main).slice(0, 20)

      rows.push({
        id: raw.sku,
        item_group_id: p.id,
        title,
        description,
        availability: raw.stock > 0 ? 'in stock' : 'out of stock',
        condition: 'new',
        price: metaPrice(onSale ? v.compareAtPrice! : v.price),
        sale_price: onSale ? metaPrice(v.price) : '',
        link: `${site}/products/${encodeURIComponent(p.slug)}`,
        image_link: main.url,
        additional_image_link: more.map((i) => i.url).join(','),
        brand: plainText(ctx.brand, 100),
        size: plainText(raw.size, 200),
        color: plainText(raw.color, 200),
        product_type: productType,
        status: 'active',
      })
    }
    if (zeroPrice) skip('A size/colour has no price (৳0) — it was left out')
  }
  return { rows, skipped }
}
