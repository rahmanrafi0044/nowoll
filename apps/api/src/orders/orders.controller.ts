import { BadRequestException, Body, Controller, Headers, Post } from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import { isUUID } from 'class-validator'
import { CreateOrderDto } from './dto/create-order.dto.js'
import { OrdersService } from './orders.service.js'

const ONE_MINUTE_MS = 60_000

@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

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
}
