import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import type { Prisma } from '@nowoll/database'
import { OrderStatus, ProductStatus, ReviewStatus, UserStatus } from '@nowoll/database/enums'
import type { Paginated } from '@nowoll/types'
import { PrismaService } from '../prisma/prisma.service.js'
import type { SubmitReviewDto } from './dto/review.dto.js'

export const ADMIN_PAGE_SIZE = 20

/** A published review as anyone may see it (no email, no full name — decision #4). */
export interface PublicReview {
  id: string
  rating: number
  title: string | null
  body: string
  author: string // "Rafi R."
  createdAt: Date
}

export interface RatingSummary {
  average: number | null // e.g. 4.3 — null while there are no reviews
  count: number
  /** How many reviews gave each number of stars: { "5": 12, "4": 3, … } */
  breakdown: Record<'1' | '2' | '3' | '4' | '5', number>
}

export interface ProductReviews extends Paginated<PublicReview> {
  summary: RatingSummary
}

/** The customer's own review, with its moderation status. */
export interface MyReview {
  id: string
  productId: string
  rating: number
  title: string | null
  body: string
  status: ReviewStatus
  rejectionReason: string | null
  updatedAt: Date
}

export interface AdminReview extends MyReview {
  product: { id: string; name: string; slug: string }
  author: { id: string; name: string | null; email: string }
  orderNumber: number
  createdAt: Date
}

/** "Rafi Rahman" → "Rafi R."  ·  "Rafi" → "Rafi"  ·  none → "Nowoll customer" */
export function publicName(fullName: string | null): string {
  const parts = (fullName ?? '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'Nowoll customer'
  return parts.length === 1 ? parts[0]! : `${parts[0]} ${parts.at(-1)![0]!.toUpperCase()}.`
}

// ============================================================================
// Reviews (Phase 4 step 24). The two rules from the spec:
//   • only VERIFIED buyers: a DELIVERED order of theirs contains the product
//   • nothing is public until an admin approves it
// Public lists also hide reviews of archived/deleted products and of banned
// or deleted customers (decision #8) — automatically, by query.
// ============================================================================
const PUBLISHED = {
  status: ReviewStatus.APPROVED,
  user: { status: UserStatus.ACTIVE, deletedAt: null },
} satisfies Prisma.ReviewWhereInput

const VISIBLE_PRODUCT = {
  status: ProductStatus.ACTIVE,
  deletedAt: null,
} satisfies Prisma.ProductWhereInput

@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  /** GET /reviews/product/:productId — summary + newest approved reviews. */
  async forProduct(productId: string, page: number, pageSize: number): Promise<ProductReviews> {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, ...VISIBLE_PRODUCT },
    })
    if (!product) throw new NotFoundException('Product not found')
    const where = { productId, ...PUBLISHED }

    const [total, rows, groups] = await this.prisma.$transaction([
      this.prisma.review.count({ where }),
      this.prisma.review.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { user: { select: { fullName: true } } },
      }),
      this.prisma.review.groupBy({
        by: ['rating'],
        where,
        orderBy: { rating: 'asc' },
        _count: { _all: true },
      }),
    ])

    const breakdown: RatingSummary['breakdown'] = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 }
    let stars = 0
    for (const g of groups) {
      const n = (g._count as { _all: number })._all
      breakdown[String(g.rating) as keyof typeof breakdown] = n
      stars += g.rating * n
    }
    return {
      summary: {
        average: total ? Math.round((stars / total) * 10) / 10 : null,
        count: total,
        breakdown,
      },
      items: rows.map((r) => ({
        id: r.id,
        rating: r.rating,
        title: r.title,
        body: r.body,
        author: publicName(r.user.fullName),
        createdAt: r.createdAt,
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    }
  }

  /** GET /reviews/my — the customer's own reviews (any status). */
  async mine(userId: string): Promise<MyReview[]> {
    const rows = await this.prisma.review.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
    })
    return rows.map(toMine)
  }

  /**
   * POST /reviews — write, or edit, the customer's review of a product.
   * Editing sends it back for approval (decision #2) — including a rejected
   * review: editing is how the customer tries again.
   */
  async submit(userId: string, dto: SubmitReviewDto): Promise<MyReview> {
    const product = await this.prisma.product.findFirst({
      where: { id: dto.productId, ...VISIBLE_PRODUCT },
    })
    if (!product) throw new NotFoundException('Product not found')

    // Verified buyer: their most recent DELIVERED order that contains this product.
    const order = await this.prisma.order.findFirst({
      where: {
        userId,
        status: OrderStatus.DELIVERED,
        items: { some: { productId: dto.productId } },
      },
      orderBy: { deliveredAt: 'desc' },
      select: { id: true },
    })
    if (!order)
      throw new ForbiddenException({
        message: 'You can review products from your delivered orders.',
        code: 'NOT_A_VERIFIED_BUYER',
      })

    const content = {
      rating: dto.rating,
      title: dto.title ?? null,
      body: dto.body,
      orderId: order.id,
    }
    const review = await this.prisma.review.upsert({
      where: { userId_productId: { userId, productId: dto.productId } }, // one per customer per product
      create: { ...content, userId, productId: dto.productId },
      update: { ...content, status: ReviewStatus.PENDING, rejectionReason: null, approvedAt: null },
    })
    return toMine(review)
  }

  // ---- Admin (Phase 5 builds the screens; the routes are admin-only) -------

  /** Oldest first, so nothing waits forever. */
  async adminList(status: ReviewStatus, page: number): Promise<Paginated<AdminReview>> {
    const where = { status }
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.review.count({ where }),
      this.prisma.review.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        skip: (page - 1) * ADMIN_PAGE_SIZE,
        take: ADMIN_PAGE_SIZE,
        include: {
          product: { select: { id: true, name: true, slug: true } },
          user: { select: { id: true, fullName: true, email: true } },
          order: { select: { orderNumber: true } },
        },
      }),
    ])
    return {
      items: rows.map((r) => ({
        ...toMine(r),
        product: r.product,
        author: { id: r.user.id, name: r.user.fullName, email: r.user.email },
        orderNumber: r.order.orderNumber,
        createdAt: r.createdAt,
      })),
      total,
      page,
      pageSize: ADMIN_PAGE_SIZE,
      totalPages: Math.ceil(total / ADMIN_PAGE_SIZE),
    }
  }

  approve(id: string): Promise<MyReview> {
    return this.moderate(id, {
      status: ReviewStatus.APPROVED,
      approvedAt: new Date(),
      rejectionReason: null,
    })
  }

  /** The reason is shown to the customer, so they can fix and resubmit. */
  reject(id: string, reason: string): Promise<MyReview> {
    return this.moderate(id, {
      status: ReviewStatus.REJECTED,
      approvedAt: null,
      rejectionReason: reason,
    })
  }

  private async moderate(id: string, data: Prisma.ReviewUpdateInput): Promise<MyReview> {
    const updated = await this.prisma.review.updateMany({ where: { id }, data })
    if (updated.count === 0) throw new NotFoundException('Review not found')
    return toMine(await this.prisma.review.findUniqueOrThrow({ where: { id } }))
  }
}

function toMine(r: {
  id: string
  productId: string
  rating: number
  title: string | null
  body: string
  status: ReviewStatus
  rejectionReason: string | null
  updatedAt: Date
}): MyReview {
  return {
    id: r.id,
    productId: r.productId,
    rating: r.rating,
    title: r.title,
    body: r.body,
    status: r.status,
    rejectionReason: r.rejectionReason,
    updatedAt: r.updatedAt,
  }
}
