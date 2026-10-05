import { Body, Controller, Post } from '@nestjs/common'
import { StrictRateLimit } from '../common/decorators/strict-rate-limit.decorator.js'
import { SubscribeDto } from './dto/subscribe.dto.js'
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
}
