import { BadRequestException } from '@nestjs/common'
import { Prisma } from '@nowoll/database'
import { ProductStatus } from '@nowoll/database/enums'

type Db = Prisma.TransactionClient

export interface CartItemInput {
  variantId: string
  quantity: number
}

export interface PricedLine {
  variantId: string
  productId: string
  productName: string
  variantLabel: string
  sku: string
  unitPrice: Prisma.Decimal
  quantity: number
  lineTotal: Prisma.Decimal
}

export interface PricedCart {
  lines: PricedLine[]
  subtotal: Prisma.Decimal
}

/**
 * Prices a cart from the DATABASE, never from what the browser says.
 * A customer can edit their cart in the browser to claim a shirt costs ৳1 —
 * that's ignored: only variant ids and quantities are taken from the request.
 * Used by the discount preview (step 15) and order creation (step 18).
 */
export async function priceCart(db: Db, items: CartItemInput[]): Promise<PricedCart> {
  // The same variant twice → one line with the quantities added up.
  const quantities = new Map<string, number>()
  for (const item of items)
    quantities.set(item.variantId, (quantities.get(item.variantId) ?? 0) + item.quantity)

  const variants = await db.productVariant.findMany({
    where: {
      id: { in: [...quantities.keys()] },
      deletedAt: null,
      isActive: true,
      product: { status: ProductStatus.ACTIVE, deletedAt: null },
    },
    include: { product: { select: { id: true, name: true, basePrice: true } } },
  })
  if (variants.length !== quantities.size) {
    throw new BadRequestException({
      message: 'Some items in your bag are no longer available. Please review your bag.',
      code: 'ITEMS_UNAVAILABLE',
    })
  }

  const lines = variants.map((v) => {
    const quantity = quantities.get(v.id)!
    const unitPrice = v.price ?? v.product.basePrice
    return {
      variantId: v.id,
      productId: v.product.id,
      productName: v.product.name,
      variantLabel: `${v.size} / ${v.color}`,
      sku: v.sku,
      unitPrice,
      quantity,
      lineTotal: unitPrice.times(quantity),
    }
  })
  const subtotal = lines.reduce((sum, l) => sum.plus(l.lineTotal), new Prisma.Decimal(0))
  return { lines, subtotal }
}

export type QuoteLineStatus = 'ok' | 'unavailable' | 'insufficient_stock'

export interface QuoteLine {
  variantId: string
  quantity: number
  status: QuoteLineStatus
  // Present unless the item is unavailable:
  productName?: string
  productSlug?: string
  variantLabel?: string
  sku?: string
  imageUrl?: string | null
  unitPrice?: Prisma.Decimal
  lineTotal?: Prisma.Decimal
}

export interface CartQuote {
  lines: QuoteLine[]
  subtotal: Prisma.Decimal // of the lines that can be priced
  canCheckout: boolean // every line ok
}

/**
 * Like priceCart(), but for SHOWING the cart: instead of refusing the whole
 * bag when one item is gone, it reports each line's status so the cart can
 * say "No longer available" or "Only a few left" next to the right item.
 * Stock is only compared with the quantity — the exact count is never sent
 * to the browser (an earlier decision: stock levels stay private).
 */
export async function quoteCart(db: Db, items: CartItemInput[]): Promise<CartQuote> {
  const quantities = new Map<string, number>()
  for (const item of items)
    quantities.set(item.variantId, (quantities.get(item.variantId) ?? 0) + item.quantity)

  const variants = await db.productVariant.findMany({
    where: {
      id: { in: [...quantities.keys()] },
      deletedAt: null,
      isActive: true,
      product: { status: ProductStatus.ACTIVE, deletedAt: null },
    },
    include: {
      product: {
        select: {
          name: true,
          slug: true,
          basePrice: true,
          images: {
            orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
            select: { url: true, variantId: true },
          },
        },
      },
    },
  })
  const byId = new Map(variants.map((v) => [v.id, v]))

  let subtotal = new Prisma.Decimal(0)
  const lines: QuoteLine[] = [...quantities].map(([variantId, quantity]) => {
    const v = byId.get(variantId)
    if (!v) return { variantId, quantity, status: 'unavailable' }
    const unitPrice = v.price ?? v.product.basePrice
    const lineTotal = unitPrice.times(quantity)
    subtotal = subtotal.plus(lineTotal)
    const image = v.product.images.find((i) => i.variantId === v.id) ?? v.product.images[0]
    return {
      variantId,
      quantity,
      status: v.stock >= quantity ? 'ok' : 'insufficient_stock',
      productName: v.product.name,
      productSlug: v.product.slug,
      variantLabel: `${v.size} / ${v.color}`,
      sku: v.sku,
      imageUrl: image?.url ?? null,
      unitPrice,
      lineTotal,
    }
  })
  return { lines, subtotal, canCheckout: lines.every((l) => l.status === 'ok') }
}
