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
  UseGuards,
} from '@nestjs/common'
import { CurrentAccount, SignedInGuard } from '../auth/auth.guard.js'
import type { AccountProfile } from '../auth/auth.service.js'
import { AddressesService } from './addresses.service.js'
import { CreateAddressDto, UpdateAddressDto } from './dto/address.dto.js'

// /api/v1/addresses — the signed-in customer's saved addresses (only ever their own).
@Controller('addresses')
@UseGuards(SignedInGuard)
export class AddressesController {
  constructor(private readonly addresses: AddressesService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  list(@CurrentAccount() account: AccountProfile) {
    return this.addresses.list(account.id)
  }

  @Post()
  create(@CurrentAccount() account: AccountProfile, @Body() dto: CreateAddressDto) {
    return this.addresses.create(account.id, dto)
  }

  @Patch(':id')
  update(
    @CurrentAccount() account: AccountProfile,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAddressDto,
  ) {
    return this.addresses.update(account.id, id, dto)
  }

  @Delete(':id')
  @HttpCode(200)
  async remove(@CurrentAccount() account: AccountProfile, @Param('id', ParseUUIDPipe) id: string) {
    await this.addresses.remove(account.id, id)
    return { deleted: true }
  }
}
