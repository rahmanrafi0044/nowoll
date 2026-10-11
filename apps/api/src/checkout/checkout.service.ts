import { Injectable } from '@nestjs/common'
import { Prisma } from '@nowoll/database'
import { DiscountsService } from '../discounts/discounts.service.js'
import type { DiscountRefusal } from '../discounts/discount-rules.js'
import { PrismaService } from '../prisma/prisma.service.js'
import { type PricedLine, priceCart } from '../pricing/cart-pricing.js'
import { SettingsService } from '../settings/settings.service.js'
import { type ShippingRate, ShippingService } from '../shipping/shipping.service.js'
import type { CheckoutQuoteDto } from './dto/checkout-quote.dto.js'
import { computeTotals, type Totals } from './totals.js'
import { PaymentsService } from '../payments/payments.service.js'
import { type PaymentRules, paymentRules } from './payment-rules.js'

type Db = Prisma.TransactionClient | PrismaService
const ZERO = new Prisma.Decimal(0)

export interface CheckoutQuote {
  lines: PricedLine[]
  totals: Totals
  discount: { code: string; amount: Prisma.Decimal } | null
  discountProblem: DiscountRefusal | null // the code was given but can't be used (shown, not fatal)
  shipping: ShippingRate | null // null until a district is chosen
  /** Which payment methods this order may use, and the minimum order (step 38c). */
  payment: PaymentRules
}

@Injectable()
export class CheckoutService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly discounts: DiscountsService,
    private readonly shipping: ShippingService,
    private readonly settings: SettingsService,
    private readonly payments: PaymentsService,
  ) {}

  /**
   * POST /checkout/quote — everything the checkout summary shows.
   * `db` is a parameter so order creation (step 18) can run the SAME
   * calculation inside its transaction.
   */
  async quote(dto: CheckoutQuoteDto, db: Db = this.prisma): Promise<CheckoutQuote> {
    const { lines, subtotal } = await priceCart(db, dto.items) // throws ITEMS_UNAVAILABLE if needed

    let discount: CheckoutQuote['discount'] = null
    let discountProblem: DiscountRefusal | null = null
    if (dto.discountCode) {
      const result = await this.discounts.evaluate(db, dto.discountCode, subtotal, dto.email)
      if (result.ok) discount = { code: result.code, amount: result.amount }
      else discountProblem = result.refusal
    }

    const shipping = dto.district ? await this.shipping.zoneFor(db, dto.district) : null
    const vatRate = await this.settings.vatRate(db)

    const totals = computeTotals({
      subtotal,
      discount: discount?.amount ?? ZERO,
      shippingFee: shipping?.fee ?? ZERO,
      freeShippingThreshold: shipping?.freeShippingThreshold ?? null,
      vatRate,
    })
    const payment = paymentRules({
      total: totals.total,
      afterDiscount: totals.afterDiscount,
      settings: await this.settings.all(),
      onlineConfigured: this.payments.onlineConfigured(),
    })
    return { lines, totals, discount, discountProblem, shipping, payment }
  }
}
