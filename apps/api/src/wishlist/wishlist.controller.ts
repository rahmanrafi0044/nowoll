import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common'
import { CurrentAccount, SignedInGuard } from '../auth/auth.guard.js'
import type { AccountProfile } from '../auth/auth.service.js'
import { AddWishlistItemDto } from './dto/add-wishlist.dto.js'
import { WishlistService } from './wishlist.service.js'

// /api/v1/wishlist — the signed-in customer's saved items.
@Controller('wishlist')
@UseGuards(SignedInGuard)
export class WishlistController {
  constructor(private readonly wishlist: WishlistService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  list(@CurrentAccount() account: AccountProfile) {
    return this.wishlist.list(account.id)
  }

  @Post()
  @HttpCode(200)
  async add(@CurrentAccount() account: AccountProfile, @Body() dto: AddWishlistItemDto) {
    await this.wishlist.add(account.id, dto.variantId)
    return { saved: true }
  }

  @Delete(':variantId')
  @HttpCode(200)
  async remove(
    @CurrentAccount() account: AccountProfile,
    @Param('variantId', ParseUUIDPipe) variantId: string,
  ) {
    await this.wishlist.remove(account.id, variantId)
    return { removed: true }
  }
}
