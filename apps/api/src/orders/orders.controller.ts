import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import { isUUID } from 'class-validator'
import { StrictRateLimit } from '../common/decorators/strict-rate-limit.decorator.js'
import { CreateOrderDto } from './dto/create-order.dto.js'
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
   */
  @Post()
  @Throttle({ default: { ttl: ONE_MINUTE_MS, limit: 10 } })
  create(
    @Body() dto: CreateOrderDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    // (@Headers can't take a validation pipe in NestJS, so it's checked here.)
    if (!idempotencyKey || !isUUID(idempotencyKey)) {
      throw new BadRequestException('An Idempotency-Key header (a UUID) is required.')
    }
    return this.orders.create(dto, idempotencyKey)
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

  /** The confirmation page's full receipt. The random order id is the key (step 21 decision #1). */
  @Get(':id/receipt')
  @Throttle({ default: { ttl: ONE_MINUTE_MS, limit: 30 } })
  receipt(@Param('id', ParseUUIDPipe) id: string) {
    return this.lookup.receipt(id)
  }
}
