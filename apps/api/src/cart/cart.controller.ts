import { Body, Controller, HttpCode, Post } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service.js'
import { quoteCart } from '../pricing/cart-pricing.js'
import { PriceCartDto } from './dto/price-cart.dto.js'

@Controller('cart')
export class CartController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Today's price and availability for each line in a bag. Public, and only
   * under the normal 100/minute limit — the cart calls it whenever it opens.
   * 200, not 201: it's a calculation, nothing is created.
   */
  @Post('price')
  @HttpCode(200)
  price(@Body() dto: PriceCartDto) {
    return quoteCart(this.prisma, dto.items)
  }
}
