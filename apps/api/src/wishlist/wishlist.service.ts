import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import type { Prisma } from '@nowoll/database'
import { ProductStatus } from '@nowoll/database/enums'
import { PrismaService } from '../prisma/prisma.service.js'
import { toPublicVariant } from '../products/product-view.js'

export const MAX_WISHLIST_ITEMS = 100

export interface WishlistEntry {
  variantId: string
  productId: string
  sku: string
  productName: string
  productSlug: string
  size: string
  color: string
  price: Prisma.Decimal // today's price (it can change after saving)
  compareAtPrice: Prisma.Decimal | null
  imageUrl: string | null
  inStock: boolean // sold-out items stay on the list, marked (decision #5)
  savedAt: Date
}

// Same rule as the bag (pricing/cart-pricing.ts): what can be sold right now.
// Anything else — an archived product, a removed size — drops off the list
// automatically, without deleting what the customer saved.
const onSale = {
  deletedAt: null,
  isActive: true,
  product: { status: ProductStatus.ACTIVE, deletedAt: null },
} satisfies Prisma.ProductVariantWhereInput

@Injectable()
export class WishlistService {
  constructor(private readonly prisma: PrismaService) {}

  /** Newest first. */
  async list(userId: string): Promise<WishlistEntry[]> {
    const rows = await this.prisma.wishlistItem.findMany({
      where: { userId, variant: onSale },
      orderBy: { createdAt: 'desc' },
      include: {
        variant: {
          include: {
            images: { orderBy: { sortOrder: 'asc' }, take: 1 },
            product: { include: { images: { orderBy: { sortOrder: 'asc' }, take: 1 } } },
          },
        },
      },
    })
    return rows.map(({ variant: v, createdAt }) => {
      const view = toPublicVariant(v, v.product)
      return {
        variantId: v.id,
        productId: v.product.id,
        sku: v.sku,
        productName: v.product.name,
        productSlug: v.product.slug,
        size: v.size,
        color: v.color,
        price: view.price,
        compareAtPrice: view.compareAtPrice,
        // A photo of THIS color if there is one, else the product's first.
        imageUrl: v.images[0]?.url ?? v.product.images[0]?.url ?? null,
        inStock: view.inStock,
        savedAt: createdAt,
      }
    })
  }

  /** Saving twice is fine — still one entry (unique user + variant). */
  async add(userId: string, variantId: string): Promise<void> {
    const variant = await this.prisma.productVariant.findFirst({
      where: { id: variantId, ...onSale },
    })
    if (!variant) throw new NotFoundException('This item is no longer available.')
    const count = await this.prisma.wishlistItem.count({ where: { userId } })
    if (count >= MAX_WISHLIST_ITEMS)
      throw new ConflictException({
        message: `Your wishlist is full (${MAX_WISHLIST_ITEMS} items). Remove something to save this.`,
        code: 'WISHLIST_FULL',
      })
    await this.prisma.wishlistItem.upsert({
      where: { userId_variantId: { userId, variantId } },
      create: { userId, variantId },
      update: {},
    })
  }

  /** Removing something that isn't there is fine too (a double tap, two tabs). */
  async remove(userId: string, variantId: string): Promise<void> {
    await this.prisma.wishlistItem.deleteMany({ where: { userId, variantId } })
  }
}
