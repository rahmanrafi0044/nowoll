import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import { CurrentAccount, SignedInGuard } from '../auth/auth.guard.js'
import type { AccountProfile } from '../auth/auth.service.js'
import { AdminOnly } from '../common/decorators/admin-only.decorator.js'
import {
  AdminReviewsQuery,
  ProductReviewsQuery,
  RejectReviewDto,
  SubmitReviewDto,
} from './dto/review.dto.js'
import { ReviewsService } from './reviews.service.js'

const ONE_MINUTE_MS = 60_000

@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  /** Public: the product page's rating summary + approved reviews. */
  @Get('product/:productId')
  forProduct(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Query() q: ProductReviewsQuery,
  ) {
    return this.reviews.forProduct(productId, q.page, q.pageSize)
  }

  /** The signed-in customer's own reviews, with their status. */
  @Get('my')
  @UseGuards(SignedInGuard)
  @Header('Cache-Control', 'no-store')
  mine(@CurrentAccount() account: AccountProfile) {
    return this.reviews.mine(account.id)
  }

  /** Write or edit a review (verified buyers only). 10 per minute. */
  @Post()
  @UseGuards(SignedInGuard)
  @Throttle({ default: { ttl: ONE_MINUTE_MS, limit: 10 } })
  submit(@CurrentAccount() account: AccountProfile, @Body() dto: SubmitReviewDto) {
    return this.reviews.submit(account.id, dto)
  }

  // ---- Admin ----
  @Get()
  @AdminOnly()
  adminList(@Query() q: AdminReviewsQuery) {
    return this.reviews.adminList(q.status, q.page)
  }

  @Patch(':id/approve')
  @AdminOnly()
  approve(@Param('id', ParseUUIDPipe) id: string) {
    return this.reviews.approve(id)
  }

  @Patch(':id/reject')
  @AdminOnly()
  reject(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RejectReviewDto) {
    return this.reviews.reject(id, dto.reason)
  }
}
