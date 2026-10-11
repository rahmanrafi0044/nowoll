import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common'
import { AdminOnly } from '../common/decorators/admin-only.decorator.js'
import { StrictRateLimit } from '../common/decorators/strict-rate-limit.decorator.js'
import { DiscountsService } from './discounts.service.js'
import { CreateDiscountDto } from './dto/create-discount.dto.js'
import { ListDiscountsQuery } from './dto/list-discounts.query.js'
import { UpdateDiscountDto } from './dto/update-discount.dto.js'
import { ValidateDiscountDto } from './dto/validate-discount.dto.js'

// Managing codes is ADMIN only (step 38e): discounts are money rules. Checking a
// code at checkout (validate) stays public.
@Controller('discounts')
export class DiscountsController {
  constructor(private readonly discounts: DiscountsService) {}

  // Public. 5 per minute per visitor: stops bots from guessing codes.
  // 200 (not 201): it creates nothing — it's a check.
  @Post('validate')
  @HttpCode(200)
  @StrictRateLimit()
  validate(@Body() dto: ValidateDiscountDto) {
    return this.discounts.preview(dto)
  }

  @Get()
  @AdminOnly({ role: 'ADMIN' })
  @Header('Cache-Control', 'no-store')
  list(@Query() query: ListDiscountsQuery) {
    return this.discounts.list(query)
  }

  @Get(':id')
  @AdminOnly({ role: 'ADMIN' })
  @Header('Cache-Control', 'no-store')
  detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.discounts.detail(id)
  }

  @Post()
  @AdminOnly({ role: 'ADMIN' })
  create(@Body() dto: CreateDiscountDto) {
    return this.discounts.create(dto)
  }

  @Patch(':id')
  @AdminOnly({ role: 'ADMIN' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateDiscountDto) {
    return this.discounts.update(id, dto)
  }

  @Delete(':id')
  @AdminOnly({ role: 'ADMIN' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.discounts.remove(id)
  }
}
