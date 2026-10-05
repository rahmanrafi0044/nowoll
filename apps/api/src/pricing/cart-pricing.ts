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
