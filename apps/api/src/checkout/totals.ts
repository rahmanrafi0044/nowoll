import { Prisma } from '@nowoll/database'

// ============================================================================
// The order's numbers, in ONE pure function. The checkout quote (step 17)
// and order creation (step 18) both call this, so the total a customer
// reviews and the total they're charged can never differ.
//
//   subtotal                 sum of products (today's prices)
// − discount                 products only — shipping is never discounted
// = after discount
// + shipping                 the zone's fee, or 0 if "after discount" reaches
//                            the zone's free-shipping threshold (decision #2)
// + VAT                      rate% of "after discount", rounded to the poisha;
//                            shipping is not taxed (decision #1)
// = total
// ============================================================================

export interface TotalsInput {
  subtotal: Prisma.Decimal
  discount: Prisma.Decimal
  shippingFee: Prisma.Decimal
  freeShippingThreshold: Prisma.Decimal | null
  vatRate: number // percent, e.g. 7.5
}

export interface Totals {
  subtotal: Prisma.Decimal
  discount: Prisma.Decimal
  afterDiscount: Prisma.Decimal
  shippingFee: Prisma.Decimal
  freeShipping: boolean
  vatRate: Prisma.Decimal
  vatAmount: Prisma.Decimal
  total: Prisma.Decimal
}

export function computeTotals(input: TotalsInput): Totals {
  const zero = new Prisma.Decimal(0)
  const discount = Prisma.Decimal.min(input.discount, input.subtotal)
  const afterDiscount = input.subtotal.minus(discount)

  const freeShipping =
    input.freeShippingThreshold !== null &&
    afterDiscount.greaterThanOrEqualTo(input.freeShippingThreshold)
  const shippingFee = freeShipping ? zero : input.shippingFee

  const vatRate = new Prisma.Decimal(input.vatRate)
  const vatAmount = afterDiscount
    .times(vatRate)
    .dividedBy(100)
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)

  return {
    subtotal: input.subtotal,
    discount,
    afterDiscount,
    shippingFee,
    freeShipping,
    vatRate,
    vatAmount,
    total: afterDiscount.plus(shippingFee).plus(vatAmount),
  }
}
