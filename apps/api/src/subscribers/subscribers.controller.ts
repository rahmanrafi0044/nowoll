import { Body, Controller, HttpCode, Post } from '@nestjs/common'
import { StrictRateLimit } from '../common/decorators/strict-rate-limit.decorator.js'
import { SubscribeDto, SubscriberTokenDto } from './dto/subscribe.dto.js'
import { SubscribersService } from './subscribers.service.js'

@Controller('subscribers')
export class SubscribersController {
  constructor(private readonly subscribers: SubscribersService) {}

  // 5 per minute per IP: stops bots from flooding the list with fake emails.
  @Post()
  @StrictRateLimit()
  subscribe(@Body() dto: SubscribeDto) {
    return this.subscribers.subscribe(dto)
  }

  /** The button on /newsletter/confirm. */
  @Post('confirm')
  @HttpCode(200)
  @StrictRateLimit()
  confirm(@Body() dto: SubscriberTokenDto) {
    return this.subscribers.confirm(dto.token)
  }

  /** The button on /newsletter/unsubscribe. */
  @Post('unsubscribe')
  @HttpCode(200)
  @StrictRateLimit()
  unsubscribe(@Body() dto: SubscriberTokenDto) {
    return this.subscribers.unsubscribe(dto.token)
  }
}
