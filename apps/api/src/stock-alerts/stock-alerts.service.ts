import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { CategoriesService } from '../categories/categories.service.js'
import { PrismaService } from '../prisma/prisma.service.js'
import type { CreateStockAlertDto } from './stock-alerts.dto.js'

// ============================================================================
// "Notify me when it's back" (38f). A shopper leaves an email for ONE sold-out
// size; when the shop restocks it, StockService queues a 'back-in-stock' job
// and the notification worker emails everyone waiting, once
// (docs/workers.md). Only the email and the size are kept.
// ============================================================================
@Injectable()
export class StockAlertsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly categories: CategoriesService,
  ) {}

  async create(dto: CreateStockAlertDto): Promise<{ waiting: true }> {
    const variant = await this.prisma.productVariant.findFirst({
      where: {
        id: dto.variantId,
        isActive: true,
        deletedAt: null,
        product: { status: 'ACTIVE', deletedAt: null },
      },
      select: { stock: true, product: { select: { categoryId: true } } },
    })
    const visible = await this.categories.visibleCategoryIds()
    if (!variant || !visible.has(variant.product.categoryId))
      throw new NotFoundException('This size is no longer sold.')
    if (variant.stock > 0)
      throw new ConflictException({
        message: 'Good news — this size is in stock now. Add it to your bag.',
        code: 'IN_STOCK',
      })

    // Asking again (e.g. it sold out again after the last email) starts a new
    // wait on the same row: one person, one size, one row.
    await this.prisma.stockAlert.upsert({
      where: { variantId_email: { variantId: dto.variantId, email: dto.email } },
      create: { variantId: dto.variantId, email: dto.email },
      update: { notifiedAt: null, createdAt: new Date() },
    })
    // The same answer whether this email was already waiting or not — the
    // form never reveals who else asked.
    return { waiting: true }
  }
}
