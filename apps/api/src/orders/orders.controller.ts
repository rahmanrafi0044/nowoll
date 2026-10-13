import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  Ip,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Throttle } from '@nestjs/throttler'
import { isUUID } from 'class-validator'
import { CurrentAccount, OptionalSignInGuard, SignedInGuard } from '../auth/auth.guard.js'
import type { AccountProfile } from '../auth/auth.service.js'
import { StrictRateLimit } from '../common/decorators/strict-rate-limit.decorator.js'
import type { EnvironmentVariables } from '../config/env.validation.js'
import { CreateOrderDto } from './dto/create-order.dto.js'
import { MyOrdersQuery } from './dto/my-orders.query.js'
import { TrackOrderDto } from './dto/track-order.dto.js'
import { OrderLookupService } from './order-lookup.service.js'
import { OrdersService } from './orders.service.js'
import { SubscribersService } from '../subscribers/subscribers.service.js'

const ONE_MINUTE_MS = 60_000

@Controller('orders')
export class OrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly lookup: OrderLookupService,
    private readonly config: ConfigService<EnvironmentVariables, true>,
    private readonly subscribers: SubscribersService,
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
  async create(
    @Body() dto: CreateOrderDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentAccount() account: AccountProfile | undefined,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string | undefined,
  ) {
    // (@Headers can't take a validation pipe in NestJS, so it's checked here.)
    if (!idempotencyKey || !isUUID(idempotencyKey)) {
      throw new BadRequestException('An Idempotency-Key header (a UUID) is required.')
    }
    // Step 39b: the browser details Meta needs — the IP address (the real one:
    // 'trust proxy' is set for Nginx) and browser name. Saved only if the
    // customer allowed Marketing (dto.tracking), and deleted after 60 days.
    const siteUrl = this.config.get('NEXT_PUBLIC_SITE_URL', { infer: true }).replace(/\/+$/, '')
    const placed = await this.orders.create(dto, idempotencyKey, account?.id ?? null, {
      ip,
      userAgent: (userAgent ?? '').slice(0, 500),
      sourceUrl: `${siteUrl}/checkout`,
    })
    // Ticked "email me" (step 42) → the usual double opt-in. Never fails the order.
    if (dto.newsletter === true)
      await this.subscribers
        .subscribe({ email: dto.contact.email, source: 'checkout' })
        .catch(() => undefined)
    return placed
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
