import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import { isUUID } from 'class-validator'
import { CurrentAccount, OptionalSignInGuard, SignedInGuard } from '../auth/auth.guard.js'
import type { AccountProfile } from '../auth/auth.service.js'
import { StrictRateLimit } from '../common/decorators/strict-rate-limit.decorator.js'
import { CreateOrderDto } from './dto/create-order.dto.js'
import { MyOrdersQuery } from './dto/my-orders.query.js'
import { TrackOrderDto } from './dto/track-order.dto.js'
import { OrderLookupService } from './order-lookup.service.js'
import { OrdersService } from './orders.service.js'

const ONE_MINUTE_MS = 60_000

@Controller('orders')
export class OrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly lookup: OrderLookupService,
  ) {}

  /**
   * Place an order (guest checkout). Requires an `Idempotency-Key` header —
   * a random UUID the checkout creates per attempt (decision #4).
   * 10 per minute per visitor (decision #8): stops scripted fake orders.
   * Guests and signed-in customers alike; a signed-in customer's order is
   * linked to their account (step 22) — that's what "My orders" will list.
   */
  @Post()
  @Throttle({ default: { ttl: ONE_MINUTE_MS, limit: 10 } })
  @UseGuards(OptionalSignInGuard)
  create(
    @Body() dto: CreateOrderDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentAccount() account: AccountProfile | undefined,
  ) {
    // (@Headers can't take a validation pipe in NestJS, so it's checked here.)
    if (!idempotencyKey || !isUUID(idempotencyKey)) {
      throw new BadRequestException('An Idempotency-Key header (a UUID) is required.')
    }
    return this.orders.create(dto, idempotencyKey, account?.id ?? null)
  }

  /**
   * "Track your order" (no account). POST, not GET: the email or phone stays
   * out of URLs, browser history and server logs. 5 per minute per visitor —
   * order numbers count up, so this stops anyone trying number after number.
   */
  @Post('track')
  @HttpCode(200)
  @StrictRateLimit()
  track(@Body() dto: TrackOrderDto) {
    return this.lookup.track(dto)
  }

  /** "My orders" (step 23) — signed-in customers only, newest first. */
  @Get('my')
  @UseGuards(SignedInGuard)
  @Header('Cache-Control', 'no-store')
  myOrders(@CurrentAccount() account: AccountProfile, @Query() query: MyOrdersQuery) {
    return this.lookup.myOrders(account.id, query.page, query.pageSize)
  }

  /** One of my orders, by its number ("NW-10001"). Someone else's → 404, like a missing one. */
  @Get('my/:number')
  @UseGuards(SignedInGuard)
  @Header('Cache-Control', 'no-store')
  myOrder(@CurrentAccount() account: AccountProfile, @Param('number') number: string) {
    return this.lookup.myOrder(account.id, number)
  }

  /** The confirmation page's full receipt. The random order id is the key (step 21 decision #1). */
  @Get(':id/receipt')
  @Throttle({ default: { ttl: ONE_MINUTE_MS, limit: 30 } })
  receipt(@Param('id', ParseUUIDPipe) id: string) {
    return this.lookup.receipt(id)
  }
}
