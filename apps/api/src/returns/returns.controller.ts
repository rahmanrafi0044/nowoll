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
  AdminReturnsQuery,
  ApproveReturnDto,
  ReceiveReturnDto,
  RefundReturnDto,
  RejectReturnDto,
  RequestReturnDto,
  ResolveRefundDto,
} from './dto/return.dto.js'
import { RefundsService } from './refunds.service.js'
import { ReturnsService } from './returns.service.js'

const ONE_MINUTE_MS = 60_000

@Controller('returns')
export class ReturnsController {
  constructor(
    private readonly returns: ReturnsService,
    private readonly refunds: RefundsService,
  ) {}

  // ---- Customer ----

  /** What can still be returned from one of my orders, and until when. */
  @Get('eligibility/:orderNumber')
  @UseGuards(SignedInGuard)
  @Header('Cache-Control', 'no-store')
  eligibility(
    @CurrentAccount() account: AccountProfile,
    @Param('orderNumber') orderNumber: string,
  ) {
    return this.returns.eligibility(account.id, orderNumber)
  }

  @Post()
  @UseGuards(SignedInGuard)
  @Throttle({ default: { ttl: ONE_MINUTE_MS, limit: 10 } })
  request(@CurrentAccount() account: AccountProfile, @Body() dto: RequestReturnDto) {
    return this.returns.request(account.id, dto)
  }

  @Get('my')
  @UseGuards(SignedInGuard)
  @Header('Cache-Control', 'no-store')
  mine(@CurrentAccount() account: AccountProfile) {
    return this.returns.mine(account.id)
  }

  // ---- Admin (screens in Phase 5) ----

  @Get()
  @AdminOnly()
  @Header('Cache-Control', 'no-store')
  adminList(@Query() q: AdminReturnsQuery) {
    return this.returns.adminList(q.status, q.page, q.q)
  }

  @Get(':id')
  @AdminOnly()
  @Header('Cache-Control', 'no-store')
  adminView(@Param('id', ParseUUIDPipe) id: string) {
    return this.returns.adminView(id)
  }

  @Patch(':id/approve')
  @AdminOnly()
  approve(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ApproveReturnDto) {
    return this.returns.approve(id, dto.note)
  }

  @Patch(':id/reject')
  @AdminOnly()
  reject(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RejectReturnDto) {
    return this.returns.reject(id, dto.reason)
  }

  @Patch(':id/receive')
  @AdminOnly()
  receive(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReceiveReturnDto) {
    return this.returns.receive(id, dto)
  }

  @Patch(':id/refund')
  @AdminOnly()
  refund(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RefundReturnDto) {
    return this.refunds.refund(id, dto)
  }

  @Patch(':id/refunds/:refundId/resolve')
  @AdminOnly()
  resolve(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('refundId', ParseUUIDPipe) refundId: string,
    @Body() dto: ResolveRefundDto,
  ) {
    return this.refunds.resolve(id, refundId, dto)
  }
}
